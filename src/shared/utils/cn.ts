import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatCurrency, formatNumber, formatPercentage, formatDate, formatDateTime, getRelativeTime } from './formatters';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { formatCurrency, formatNumber, formatPercentage, formatDate, formatDateTime, getRelativeTime as formatRelativeTime };