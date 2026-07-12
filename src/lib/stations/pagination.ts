export interface PaginationOptions {
  pageSize?: number;
  maxPages?: number;
}

export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  { pageSize = 1_000, maxPages = 10 }: PaginationOptions = {},
) {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("Pagination pageSize must be a positive integer.");
  }

  if (!Number.isInteger(maxPages) || maxPages <= 0) {
    throw new Error("Pagination maxPages must be a positive integer.");
  }

  const rows: T[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const pageRows = await fetchPage(from, from + pageSize - 1);
    rows.push(...pageRows);

    if (pageRows.length < pageSize) {
      return rows;
    }
  }

  throw new Error(`Pagination exceeded the ${maxPages}-page safety limit.`);
}
