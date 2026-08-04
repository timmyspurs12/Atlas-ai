import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import { Avatar } from '../ui/Avatar';
import { MapFallback } from './MapFallback';
import type { MapSurfaceProps } from './types';
import { runtime } from '@/shared/config/runtime';

if (runtime.mapboxAccessToken) void Mapbox.setAccessToken(runtime.mapboxAccessToken);

export function MapSurface(props: MapSurfaceProps) {
  const selected = useMemo(
    () => props.people.find((person) => person.id === props.selectedPersonId) ?? props.people[0],
    [props.people, props.selectedPersonId],
  );

  useEffect(() => {
    void Mapbox.setTelemetryEnabled(false);
  }, []);

  if (!runtime.mapboxAccessToken) return <MapFallback {...props} />;

  const styleURL = props.satellite
    ? Mapbox.StyleURL.SatelliteStreet
    : props.dark
      ? Mapbox.StyleURL.Dark
      : Mapbox.StyleURL.Light;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Mapbox.MapView
        style={StyleSheet.absoluteFill}
        styleURL={styleURL}
        logoEnabled={false}
        scaleBarEnabled={false}
        attributionEnabled
      >
        <Mapbox.Camera
          centerCoordinate={selected ? [selected.longitude, selected.latitude] : [3.3942, 6.4551]}
          zoomLevel={12.5}
          animationDuration={700}
        />
        {props.people.map((person) => (
          <Mapbox.PointAnnotation
            key={person.id}
            id={person.id}
            coordinate={[person.longitude, person.latitude]}
            onSelected={() => props.onSelectPerson(person.id)}
          >
            <Avatar name={person.name} color={person.color} size={44} ring />
          </Mapbox.PointAnnotation>
        ))}
      </Mapbox.MapView>
    </View>
  );
}
