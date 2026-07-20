import { Alert, Box, CircularProgress, Typography } from '@mui/material';

export function LoadingState() { return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 220 }}><CircularProgress /></Box>; }
export function ErrorState({ message }: { message: string }) { return <Alert severity="error">{message}</Alert>; }
export function EmptyState({ message }: { message: string }) { return <Box sx={{ py: 6, textAlign: 'center' }}><Typography color="text.secondary">{message}</Typography></Box>; }
