import { useEffect, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { matchCityName, matchCountryName } from '@/lib/location-api';
import { useCities, useCountries, useIpLocation } from '@/hooks/useCountriesCities';

interface CountryCityFieldsProps {
  country: string;
  city: string;
  onCountryChange: (country: string) => void;
  onCityChange: (city: string) => void;
  onLocationDetected?: (country: string, city: string) => void;
  autoDetectFromIp?: boolean;
}

export function CountryCityFields({
  country,
  city,
  onCountryChange,
  onCityChange,
  onLocationDetected,
  autoDetectFromIp = true,
}: CountryCityFieldsProps) {
  const ipApplied = useRef(false);
  const onLocationDetectedRef = useRef(onLocationDetected);
  const onCountryChangeRef = useRef(onCountryChange);
  const onCityChangeRef = useRef(onCityChange);

  onLocationDetectedRef.current = onLocationDetected;
  onCountryChangeRef.current = onCountryChange;
  onCityChangeRef.current = onCityChange;

  const { data: countries = [], isLoading: countriesLoading, isError: countriesError } = useCountries();
  const { data: cities = [], isLoading: citiesLoading, isError: citiesError } = useCities(country);
  const shouldDetectIp = autoDetectFromIp && !country;
  const { data: ipLocation, isLoading: ipLoading, isError: ipError } = useIpLocation(shouldDetectIp);

  useEffect(() => {
    if (
      !autoDetectFromIp ||
      ipApplied.current ||
      !ipLocation ||
      country ||
      countriesLoading ||
      !countries.length
    ) {
      return;
    }

    const countryNames = countries.map((c) => c.name);
    const matchedCountry = matchCountryName(ipLocation.country, countryNames);
    if (!matchedCountry) return;

    ipApplied.current = true;
    const detectedCity = ipLocation.city || '';
    if (onLocationDetectedRef.current) {
      onLocationDetectedRef.current(matchedCountry, detectedCity);
    } else {
      onCountryChangeRef.current(matchedCountry);
      if (detectedCity) onCityChangeRef.current(detectedCity);
    }
  }, [autoDetectFromIp, ipLocation, country, countries, countriesLoading]);

  useEffect(() => {
    if (!country || citiesLoading || !city || !cities.length) return;
    const match = matchCityName(city, cities);
    if (!match) onCityChangeRef.current('');
    else if (match !== city) onCityChangeRef.current(match);
    // Only re-validate when the city list or country changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities, citiesLoading, country]);

  const detecting = ipLoading && autoDetectFromIp && !country;
  const countryPlaceholder = countriesLoading
    ? 'Loading countries…'
    : detecting
      ? 'Detecting location…'
      : 'Select country';

  return (
    <div className="grid grid-cols-2 gap-4 items-start">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="country">Country</Label>
        <Select
          id="country"
          autoComplete="country-name"
          value={country}
          disabled={countriesLoading || detecting}
          onChange={(e) => onCountryChange(e.target.value)}
        >
          <option value="">{countryPlaceholder}</option>
          {countries.map((c) => (
            <option key={c.iso2} value={c.name}>
              {c.name}
            </option>
          ))}
        </Select>
        <p className="min-h-[1.25rem] text-xs text-[var(--color-destructive)]">
          {countriesError ? 'Could not load countries' : ipError && !country ? 'Could not detect location' : ''}
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="city">City</Label>
        <Select
          id="city"
          autoComplete="address-level2"
          value={city}
          disabled={!country || citiesLoading}
          onChange={(e) => onCityChange(e.target.value)}
        >
          <option value="">
            {!country
              ? 'Select country first'
              : citiesLoading
                ? 'Loading cities…'
                : 'Select city'}
          </option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <p className="min-h-[1.25rem] text-xs text-[var(--color-destructive)]">
          {citiesError && country ? 'Could not load cities' : ''}
        </p>
      </div>
    </div>
  );
}
