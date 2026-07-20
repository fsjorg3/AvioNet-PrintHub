import { Box, Chip, Stack, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../api/admin';
import type { Consumable } from '../api/types';
import { ErrorState, LoadingState } from '../components/PageState';

export function ConsumablesPage() {
  const query = useQuery({ queryKey: ['consumables'], queryFn: adminApi.consumables });
  const columns: GridColDef<Consumable>[] = [{ field: 'kiosk_id', headerName: 'Kiosco', flex: 1, minWidth: 180 }, { field: 'type', headerName: 'Consumible', flex: 1, minWidth: 140 }, { field: 'status', headerName: 'Estado', width: 130, renderCell: ({ value }) => <Chip size="small" label={value} color={value === 'ok' ? 'success' : value === 'low' ? 'warning' : value === 'critical' || value === 'empty' ? 'error' : 'default'} /> }, { field: 'level_percent', headerName: 'Nivel', width: 100, valueFormatter: value => value === null ? 'N/D' : `${value}%` }, { field: 'reported_at', headerName: 'Actualizado', minWidth: 170 }];
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState message="No fue posible cargar los consumibles." />;
  return <Stack spacing={3}><Box><Typography variant="h4">Consumibles</Typography><Typography color="text.secondary">Último reporte por tipo y kiosco.</Typography></Box><DataGrid autoHeight rows={query.data!.consumables} columns={columns} getRowId={row => `${row.kiosk_id}-${row.type}`} disableRowSelectionOnClick pageSizeOptions={[10, 25, 50]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} /></Stack>;
}
