'use client';

import { useEffect, useRef, useState } from 'react';

// Declare naver namespace for TypeScript
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
    interface Window {
        naver: {
            maps: {
                Map: any;
                LatLng: any;
                Marker: any;
                Event: any;
                Point: any;
            };
        };
    }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface NaverMapWrapperProps {
    markers?: Array<{
        id: number;
        lat: number;
        lng: number;
        title: string;
        price: string;
    }>;
    onMarkerClick?: (id: number) => void;
    onBoundsChange?: (bounds: unknown) => void;
}

export function NaverMapWrapper({ markers = [], onMarkerClick, onBoundsChange }: NaverMapWrapperProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [map, setMap] = useState<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const markersRef = useRef<any[]>([]);

    useEffect(() => {
        // 1. Script Load
        const script = document.createElement('script');
        // NOTE: Using a public demo client ID for now or placeholder
        const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID || 'yqqv9q1n4j';
        script.src = `https://openapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${clientId}`;
        script.async = true;

        script.onload = () => {
            if (window.naver && window.naver.maps) {
                // 2. Map Initialize
                const mapOptions = {
                    center: new window.naver.maps.LatLng(37.5665, 126.9780), // Seoul default
                    zoom: 13,
                    minZoom: 7,
                    scaleControl: false,
                    logoControl: false,
                    mapDataControl: false,
                };

                const mapInstance = new window.naver.maps.Map('naver-map', mapOptions);
                setMap(mapInstance);

                window.naver.maps.Event.addListener(mapInstance, 'idle', () => {
                    if (onBoundsChange) onBoundsChange(mapInstance.getBounds());
                });
            }
        };

        document.head.appendChild(script);

        return () => {
            document.head.removeChild(script);
        };
    }, [onBoundsChange]);

    // Update markers when map or markers array changes
    useEffect(() => {
        if (!map || !window.naver) return;

        // Clear existing markers
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        markersRef.current.forEach((marker: any) => marker.setMap(null));
        markersRef.current = [];

        // Create new markers
        markers.forEach(property => {
            const position = new window.naver.maps.LatLng(property.lat, property.lng);

            const markerOptions = {
                position,
                map,
                title: property.title,
                icon: {
                    content: `
            <div style="background-color: white; border: 1px solid #ddd; padding: 4px 8px; border-radius: 20px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2); cursor: pointer; white-space: nowrap;">
              <span style="color: #03C75A; font-size: 14px;">${property.price}</span>
            </div>
          `,
                    anchor: new window.naver.maps.Point(40, 15),
                }
            };

            const marker = new window.naver.maps.Marker(markerOptions);

            if (onMarkerClick) {
                window.naver.maps.Event.addListener(marker, 'click', () => {
                    onMarkerClick(property.id);
                });
            }

            markersRef.current.push(marker);
        });
    }, [map, markers, onMarkerClick]);

    return (
        <div
            id="naver-map"
            ref={mapRef}
            className="w-full h-full min-h-[500px] bg-muted/20"
        />
    );
}
