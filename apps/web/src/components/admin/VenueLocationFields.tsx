import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { fetchCityCoords } from '@/lib/location-api';
import { CountryCityFields } from '@/components/location/CountryCityFields';

interface VenueLocationFieldsProps {
  country: string;
  city: string;
  latitude: string;
  longitude: string;
  onCountryChange: (country: string) => void;
  onCityChange: (city: string) => void;
  onCoordsChange: (latitude: string, longitude: string) => void;
}

export function VenueLocationFields({
  country,
  city,
  latitude,
  longitude,
  onCountryChange,
  onCityChange,
  onCoordsChange,
}: VenueLocationFieldsProps) {
  const { data: coords, isLoading: coordsLoading, isError: coordsError } = useQuery({
    queryKey: ['geo', 'coords', country, city],
    queryFn: () => fetchCityCoords(country, city),
    enabled: !!country && !!city,
    staleTime: 1000 * 60 * 60 * 24,
  });

  useEffect(() => {
    if (coords) {
      onCoordsChange(String(coords.lat), String(coords.lng));
    } else if (!city) {
      onCoordsChange('', '');
    }
  }, [coords, city, onCoordsChange]);

  return (
    <>
      <CountryCityFields
        country={country}
        city={city}
        onCountryChange={(nextCountry) => {
          onCountryChange(nextCountry);
          onCityChange('');
          onCoordsChange('', '');
        }}
        onCityChange={onCityChange}
        autoDetectFromIp={false}
        countryId="venue-country"
        cityId="venue-city"
      />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Latitude</Label>
          <input
            readOnly
            className="mt-1 flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 text-sm text-[var(--color-muted-foreground)]"
            value={coordsLoading && city ? 'Loading…' : latitude}
            placeholder="Select a city"
          />
        </div>
        <div>
          <Label>Longitude</Label>
          <input
            readOnly
            className="mt-1 flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 text-sm text-[var(--color-muted-foreground)]"
            value={coordsLoading && city ? 'Loading…' : longitude}
            placeholder="Select a city"
          />
        </div>
      </div>
      {coordsError && city ? (
        <p className="text-xs text-[var(--color-destructive)]">
          Could not resolve coordinates — try another city name
        </p>
      ) : null}
    </>
  );
}
