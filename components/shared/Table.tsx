import React from "react";

interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (item: T) => React.ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  className?: string;
}

export function Table<T extends Record<string, any>>({
  columns,
  data,
  emptyMessage = "No records found.",
  className = "",
}: TableProps<T>) {
  return (
    <div className={`w-full overflow-x-auto rounded-lg border border-[#E5E9EF] ${className}`}>
      <table className="w-full text-left border-collapse text-[13px] md:text-[14px]">
        <thead>
          <tr className="bg-[#EEF1F5] border-b border-[#E5E9EF] text-[#788391] font-semibold">
            {columns.map((col, idx) => (
              <th key={idx} className={`px-4 py-3 font-semibold ${col.className || ""}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E9EF] bg-white text-[#202936]">
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-sm text-[#788391]"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rIdx) => (
              <tr
                key={rIdx}
                className="hover:bg-[#EEF1F5]/60 transition-colors"
              >
                {columns.map((col, cIdx) => (
                  <td key={cIdx} className={`px-4 py-3.5 align-middle ${col.className || ""}`}>
                    {col.cell ? col.cell(row) : col.accessorKey ? String(row[col.accessorKey] ?? "") : null}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
