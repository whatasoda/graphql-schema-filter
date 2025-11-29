import {
  concatMap,
  defer,
  firstValueFrom,
  from,
  map,
  mergeMap,
  shareReplay,
  toArray,
  catchError,
  of,
} from "rxjs";
import { fg } from "../libs/fast-glob";
import { readFile } from "fs/promises";

interface DocumentCollectorOptions {
  patterns: fg.Pattern[];
  globOptions?: fg.Options;
  fileReadConcurrency: number;
}

type DocumentCollectorResult<TParsed> =
  | {
      type: "parsed";
      parsed: TParsed;
      raw: string;
    }
  | {
      type: "error";
      error: unknown;
    };

interface DocumentCollector<TParsed> {
  collect: () => Promise<DocumentCollectorResult<TParsed>>;
}

export function createDocumentCollector<TParsed>(
  options: DocumentCollectorOptions,
  parse: (content: string) => TParsed
): DocumentCollector<TParsed> {
  const result$ = defer(
    async () => await fg.async(options.patterns, options.globOptions)
  ).pipe(
    concatMap((globResult) => {
      const documentPaths = globResult.filter(
        (document) => document.endsWith(".graphql") || document.endsWith(".gql")
      );

      return from(documentPaths).pipe(
        mergeMap(
          async (documentPath, index) => ({
            index,
            content: await readFile(documentPath, "utf-8"),
          }),
          options.fileReadConcurrency
        ),
        toArray()
      );
    }),
    map((contents) => {
      const schemaContent = contents
        .sort((a, b) => a.index - b.index)
        .map(({ content }) => content)
        .join("\n");

      return {
        type: "parsed" as const,
        parsed: parse(schemaContent),
        raw: schemaContent,
      };
    }),
    catchError((error) => of({ type: "error" as const, error })),
    shareReplay(1)
  );

  const collect = () => firstValueFrom(result$);

  return { collect };
}
