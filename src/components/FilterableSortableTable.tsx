import { useState, useMemo, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Filter, X, Loader2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export interface ColumnDef<T> {
  key: string;
  header: string;
  accessor: (row: T) => any;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  filterable?: boolean;
  filterType?: 'text' | 'select';
  filterOptions?: { label: string; value: string }[];
  align?: 'left' | 'right' | 'center';
  className?: string;
}

interface FilterableSortableTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  loading?: boolean;
  emptyMessage?: string;
  pageSize?: number;
  keyExtractor: (row: T) => string;
}

export function FilterableSortableTable<T>({
  data,
  columns,
  loading = false,
  emptyMessage = "Nenhum dado encontrado",
  pageSize = 10,
  keyExtractor,
}: FilterableSortableTableProps<T>) {
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);

  const hasActiveFilters = Object.values(filters).some(v => v && v !== 'all');

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  }, [sortKey]);

  const setFilter = useCallback((key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
    setPage(1);
  }, []);

  const filteredData = useMemo(() => {
    let result = data;

    // Apply filters
    for (const col of columns) {
      const filterVal = filters[col.key];
      if (!filterVal || filterVal === 'all') continue;
      
      if (col.filterType === 'select') {
        result = result.filter(row => {
          const val = col.accessor(row);
          return String(val ?? '').toLowerCase() === filterVal.toLowerCase();
        });
      } else {
        result = result.filter(row => {
          const val = col.accessor(row);
          return String(val ?? '').toLowerCase().includes(filterVal.toLowerCase());
        });
      }
    }

    // Apply sorting
    if (sortKey) {
      const col = columns.find(c => c.key === sortKey);
      if (col) {
        result = [...result].sort((a, b) => {
          const aVal = col.accessor(a);
          const bVal = col.accessor(b);

          if (aVal == null && bVal == null) return 0;
          if (aVal == null) return 1;
          if (bVal == null) return -1;

          let comparison = 0;
          if (typeof aVal === 'number' && typeof bVal === 'number') {
            comparison = aVal - bVal;
          } else {
            comparison = String(aVal).localeCompare(String(bVal), 'pt-BR', { numeric: true });
          }
          return sortDir === 'asc' ? comparison : -comparison;
        });
      }
    }

    return result;
  }, [data, filters, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, page, pageSize]);

  const filterableColumns = columns.filter(c => c.filterable !== false);

  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (sortKey !== colKey) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
    return sortDir === 'asc' 
      ? <ArrowUp className="ml-1 h-3 w-3 text-primary" /> 
      : <ArrowDown className="ml-1 h-3 w-3 text-primary" />;
  };

  return (
    <div className="space-y-3">
      {/* Filter Controls */}
      {filterableColumns.length > 0 && (
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="flex items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                Filtros
                {hasActiveFilters && (
                  <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-xs font-bold">
                    {Object.values(filters).filter(v => v && v !== 'all').length}
                  </span>
                )}
              </Button>
            </CollapsibleTrigger>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground">
                <X className="h-3 w-3" /> Limpar filtros
              </Button>
            )}
          </div>
          <CollapsibleContent className="mt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-3 rounded-lg border bg-muted/30">
              {filterableColumns.map(col => (
                <div key={col.key} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{col.header}</label>
                  {col.filterType === 'select' && col.filterOptions ? (
                    <Select
                      value={filters[col.key] || 'all'}
                      onValueChange={(v) => setFilter(col.key, v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {col.filterOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder={`Filtrar ${col.header.toLowerCase()}...`}
                      value={filters[col.key] || ''}
                      onChange={(e) => setFilter(col.key, e.target.value)}
                      className="h-8 text-xs"
                    />
                  )}
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <Table className="min-w-max">
          <TableHeader>
            <TableRow>
              {columns.map(col => (
                <TableHead
                  key={col.key}
                  className={`whitespace-nowrap ${col.align === 'right' ? 'text-right' : ''} ${col.className || ''}`}
                >
                  {col.sortable !== false ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 -ml-2 font-medium hover:bg-accent"
                      onClick={() => handleSort(col.key)}
                    >
                      {col.header}
                      <SortIcon colKey={col.key} />
                    </Button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8">
                  <div className="flex justify-center">
                    <Loader2 className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                  {hasActiveFilters ? 'Nenhum resultado com os filtros aplicados' : emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map(row => (
                <TableRow key={keyExtractor(row)}>
                  {columns.map(col => (
                    <TableCell
                      key={col.key}
                      className={`whitespace-nowrap ${col.align === 'right' ? 'text-right' : ''} ${col.className || ''}`}
                    >
                      {col.render ? col.render(row) : String(col.accessor(row) ?? '')}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {filteredData.length > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, filteredData.length)} de {filteredData.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Próximo <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
