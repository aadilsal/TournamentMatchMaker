import { useQuery } from '@tanstack/react-query';
import { fetchCitiesByCountry, fetchCountries, fetchLocationFromIp } from '@/lib/location-api';

export function useCountries() {
  return useQuery({
    queryKey: ['countries'],
    queryFn: fetchCountries,
    staleTime: 1000 * 60 * 60 * 24,
  });
}

export function useCities(country: string) {
  return useQuery({
    queryKey: ['cities', country],
    queryFn: () => fetchCitiesByCountry(country),
    enabled: !!country,
    staleTime: 1000 * 60 * 60,
  });
}

export function useIpLocation(enabled = true) {
  return useQuery({
    queryKey: ['ip-location'],
    queryFn: fetchLocationFromIp,
    enabled,
    staleTime: 1000 * 60 * 30,
    retry: 2,
    refetchOnMount: 'always',
  });
}
