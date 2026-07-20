import { Box, Stack, TextField, Typography } from '@mui/material';
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { adminApi } from '../api/admin';
import type { PrintJob } from '../api/types';
import { ErrorState, LoadingState } from '../components/PageState';

export function PrintJobsPage() {
  const navigate = useNavigate();
  const [model, setModel] = useState<GridPaginationModel>({ page: 0, pageSize: 25 });
  const [pin, setPin] = useState('');
  const query = useQuery({ queryKey: ['print-jobs', model, pin], queryFn: () => adminApi.printJobs({ page: model.page + 1, pageSize: model.pageSize, pin }) });
  const columns: GridColDef<PrintJob>[] = [
    { field: 'id', headerName: '#', width: 75 }, { field: 'kiosk_name', headerName: 'Kiosco', flex: 1, minWidth: 150 }, { field: 'pin', headerName: 'PIN', width: 110, valueFormatter: value => value || 'Manual' }, { field: 'pages', headerName: 'Páginas', width: 100 }, { field: 'revenue', headerName: 'Ingreso', width: 120, valueFormatter: value => `$${Number(value).toFixed(2)}` }, { field: 'created_at', headerName: 'Fecha', minWidth: 165 },
  ];
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState message="No fue posible cargar los trabajos." />;
  return <Stack spacing={3}><Box><Typography variant="h4">Trabajos de impresión</Typography><Typography color="text.secondary">Historial reportado por los kioscos.</Typography></Box><TextField fullWidth label="Filtrar por PIN" value={pin} onChange={event => { setPin(event.target.value); setModel(current => ({ ...current, page: 0 })); }} sx={{ maxWidth: { sm: 260 } }} /><Box sx={{ width: '100%', minWidth: 0 }}><DataGrid autoHeight rows={query.data!.items} columns={columns} loading={query.isFetching} paginationMode="server" rowCount={query.data!.pagination.total} paginationModel={model} onPaginationModelChange={setModel} pageSizeOptions={[10, 25, 50]} disableRowSelectionOnClick onRowClick={({ row }) => navigate(`/print-jobs/${row.id}`)} sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }} /></Box></Stack>;
}
