import {
  Sun, Cloud, CloudDrizzle, CloudRain, CloudLightning,
  CloudSnow, Wind, Thermometer, type LucideProps,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const WEATHER_ICONS: Record<string, React.ComponentType<LucideProps>> = {
  clear: Sun,
  cloudy: Cloud,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  heavy_rain: CloudLightning,
  snow: CloudSnow,
  fog: Cloud,
  windy: Wind,
};

interface WeatherIconProps extends LucideProps {
  condition: string;
}

export function WeatherIcon({ condition, className, ...props }: WeatherIconProps) {
  const Icon = WEATHER_ICONS[condition] ?? Thermometer;
  return <Icon className={cn('h-5 w-5', className)} {...props} />;
}
