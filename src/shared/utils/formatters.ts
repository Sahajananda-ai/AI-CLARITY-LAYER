export function formatCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return '₹0';
  // Rupees are displayed whole: computed values like EMIs arrive with long
  // decimal tails that read as noise next to a real product's numbers.
  const whole = Math.round(amount);
  if (whole >= 10000000) {
    return `₹${(whole / 10000000).toFixed(1)} Cr`;
  }
  if (whole >= 100000) {
    return `₹${(whole / 100000).toFixed(1)} L`;
  }
  return `₹${whole.toLocaleString('en-IN')}`;
}

export function formatNumber(num: number): string {
  return num.toLocaleString('en-IN');
}

export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}