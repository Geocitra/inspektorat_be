// src/common/utils/geo.util.ts
// Helper matematika murni berbasis rumus Haversine.
// Menghitung jarak bumi antara dua titik koordinat GPS (dalam satuan meter).
// Menghindari kebutuhan kompilasi ekstensi PostGIS di lingkungan lokal.

export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Radius bumi dalam meter
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
      
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Jarak dalam meter
}

/**
 * Parsing koordinat string format "latitude,longitude" menjadi objek numerik.
 * Mengembalikan null jika format tidak valid.
 */
export function parseCoordinates(coordString: string): { latitude: number; longitude: number } | null {
  if (!coordString) return null;
  
  const parts = coordString.split(',');
  if (parts.length !== 2) return null;
  
  const latitude = parseFloat(parts[0].trim());
  const longitude = parseFloat(parts[1].trim());
  
  if (isNaN(latitude) || isNaN(longitude)) return null;
  
  return { latitude, longitude };
}
