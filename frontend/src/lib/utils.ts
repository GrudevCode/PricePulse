import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function formatMultiplier(m: number): string {
  return `×${m.toFixed(2)}`;
}

export function getDemandColor(score: number): string {
  if (score <= 30) return 'text-red-400';
  if (score <= 60) return 'text-amber-400';
  if (score <= 80) return 'text-blue-400';
  return 'text-green-400';
}

export function getDemandBgColor(score: number): string {
  if (score <= 30) return 'bg-red-500/20 border-red-500/30';
  if (score <= 60) return 'bg-amber-500/20 border-amber-500/30';
  if (score <= 80) return 'bg-blue-500/20 border-blue-500/30';
  return 'bg-green-500/20 border-green-500/30';
}

export function getDemandLabel(score: number): string {
  if (score <= 30) return 'Low Demand';
  if (score <= 60) return 'Moderate';
  if (score <= 80) return 'High Demand';
  return 'Peak Demand';
}

export function getWeatherConditionName(condition: string): string {
  const names: Record<string, string> = {
    clear: 'Clear',
    cloudy: 'Cloudy',
    drizzle: 'Drizzle',
    rain: 'Rain',
    heavy_rain: 'Heavy Rain',
    snow: 'Snow',
    fog: 'Fog',
    windy: 'Windy',
  };
  return names[condition] || condition;
}

export function getPeriodLabel(period: string): string {
  const labels: Record<string, string> = {
    early_morning: 'Early Morning',
    breakfast: 'Breakfast',
    lunch: 'Lunch Rush',
    afternoon: 'Afternoon',
    dinner: 'Dinner Rush',
    late_night: 'Late Night',
  };
  return labels[period] || period;
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} mins ago`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return '1 hour ago';
  return `${hours} hours ago`;
}
