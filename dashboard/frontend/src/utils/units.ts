import type { Region } from '../store';

const KM_TO_MI = 0.621371;

export function formatDistance(km: number | null | undefined, region: Region, decimals: number = 1): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return '--';
  if (region === 'america') return `${(km * KM_TO_MI).toFixed(decimals)} mi`;
  return `${km.toFixed(decimals)} km`;
}

export function formatSpeed(kmh: number | null | undefined, region: Region, decimals: number = 1): string {
  if (kmh === null || kmh === undefined || !Number.isFinite(kmh)) return '--';
  if (region === 'america') return `${(kmh * KM_TO_MI).toFixed(decimals)} mph`;
  return `${kmh.toFixed(decimals)} km/h`;
}

export function convertDistance(km: number, region: Region): number {
  return region === 'america' ? km * KM_TO_MI : km;
}

export function convertSpeed(kmh: number, region: Region): number {
  return region === 'america' ? kmh * KM_TO_MI : kmh;
}

export function distanceUnitLabel(region: Region): string {
  return region === 'america' ? 'mi' : 'km';
}

export function speedUnitLabel(region: Region): string {
  return region === 'america' ? 'mph' : 'km/h';
}
