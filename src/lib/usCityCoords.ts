export interface CityCoords {
  lat: number;
  lng: number;
}

/**
 * Static map of US city names (lowercase) to approximate city-center coordinates.
 * Covers all 50 state capitals, top ~200 cities by population, and additional mid-size cities.
 * Keys are lowercase city names; the lookup function should normalize input to lowercase before matching.
 * State-qualified keys (e.g. "portland or") are included for ambiguous city names.
 */
export const US_CITY_COORDS: Record<string, CityCoords> = {
  // ── Top 10 by population ──────────────────────────────────────────────────
  "new york": { lat: 40.7128, lng: -74.006 },
  "los angeles": { lat: 34.0522, lng: -118.2437 },
  "chicago": { lat: 41.8781, lng: -87.6298 },
  "houston": { lat: 29.7604, lng: -95.3698 },
  "phoenix": { lat: 33.4484, lng: -112.074 },
  "philadelphia": { lat: 39.9526, lng: -75.1652 },
  "san antonio": { lat: 29.4241, lng: -98.4936 },
  "san diego": { lat: 32.7157, lng: -117.1611 },
  "dallas": { lat: 32.7767, lng: -96.797 },
  "san jose": { lat: 37.3382, lng: -121.8863 },

  // ── 11–50 by population ───────────────────────────────────────────────────
  "austin": { lat: 30.2672, lng: -97.7431 },
  "jacksonville": { lat: 30.3322, lng: -81.6557 },
  "fort worth": { lat: 32.7555, lng: -97.3308 },
  "columbus": { lat: 39.9612, lng: -82.9988 },
  "charlotte": { lat: 35.2271, lng: -80.8431 },
  "indianapolis": { lat: 39.7684, lng: -86.1581 },
  "san francisco": { lat: 37.7749, lng: -122.4194 },
  "seattle": { lat: 47.6062, lng: -122.3321 },
  "denver": { lat: 39.7392, lng: -104.9903 },
  "oklahoma city": { lat: 35.4676, lng: -97.5164 },
  "nashville": { lat: 36.1627, lng: -86.7816 },
  "el paso": { lat: 31.7619, lng: -106.485 },
  "washington": { lat: 38.9072, lng: -77.0369 },
  "las vegas": { lat: 36.1699, lng: -115.1398 },
  "louisville": { lat: 38.2527, lng: -85.7585 },
  "memphis": { lat: 35.1495, lng: -90.049 },
  "portland": { lat: 45.5051, lng: -122.675 },
  "baltimore": { lat: 39.2904, lng: -76.6122 },
  "milwaukee": { lat: 43.0389, lng: -87.9065 },
  "albuquerque": { lat: 35.0844, lng: -106.6504 },
  "tucson": { lat: 32.2226, lng: -110.9747 },
  "fresno": { lat: 36.7378, lng: -119.7871 },
  "mesa": { lat: 33.4152, lng: -111.8315 },
  "sacramento": { lat: 38.5816, lng: -121.4944 },
  "atlanta": { lat: 33.749, lng: -84.388 },
  "kansas city": { lat: 39.0997, lng: -94.5786 },
  "omaha": { lat: 41.2565, lng: -95.9345 },
  "colorado springs": { lat: 38.8339, lng: -104.8214 },
  "raleigh": { lat: 35.7796, lng: -78.6382 },
  "long beach": { lat: 33.77, lng: -118.1937 },
  "virginia beach": { lat: 36.8529, lng: -75.978 },
  "miami": { lat: 25.7617, lng: -80.1918 },
  "oakland": { lat: 37.8044, lng: -122.2712 },
  "minneapolis": { lat: 44.9778, lng: -93.265 },
  "tulsa": { lat: 36.154, lng: -95.9928 },
  "tampa": { lat: 27.9506, lng: -82.4572 },
  "arlington": { lat: 32.7357, lng: -97.1081 },
  "new orleans": { lat: 29.9511, lng: -90.0715 },
  "wichita": { lat: 37.6872, lng: -97.3301 },

  // ── 51–100 by population ──────────────────────────────────────────────────
  "cleveland": { lat: 41.4993, lng: -81.6944 },
  "bakersfield": { lat: 35.3733, lng: -119.0187 },
  "aurora": { lat: 39.7294, lng: -104.8319 },
  "anaheim": { lat: 33.8366, lng: -117.9143 },
  "santa ana": { lat: 33.7455, lng: -117.8677 },
  "corpus christi": { lat: 27.8006, lng: -97.3964 },
  "riverside": { lat: 33.9806, lng: -117.3755 },
  "lexington": { lat: 38.0406, lng: -84.5037 },
  "st. louis": { lat: 38.627, lng: -90.1994 },
  "saint louis": { lat: 38.627, lng: -90.1994 },
  "pittsburgh": { lat: 40.4406, lng: -79.9959 },
  "stockton": { lat: 37.9577, lng: -121.2908 },
  "anchorage": { lat: 61.2181, lng: -149.9003 },
  "cincinnati": { lat: 39.1031, lng: -84.512 },
  "st. paul": { lat: 44.9537, lng: -93.09 },
  "saint paul": { lat: 44.9537, lng: -93.09 },
  "greensboro": { lat: 36.0726, lng: -79.792 },
  "toledo": { lat: 41.6639, lng: -83.5552 },
  "newark": { lat: 40.7357, lng: -74.1724 },
  "plano": { lat: 33.0198, lng: -96.6989 },
  "henderson": { lat: 36.0395, lng: -114.9817 },
  "orlando": { lat: 28.5383, lng: -81.3792 },
  "lincoln": { lat: 40.8136, lng: -96.7026 },
  "buffalo": { lat: 42.8864, lng: -78.8784 },
  "fort wayne": { lat: 41.1306, lng: -85.1289 },
  "jersey city": { lat: 40.7178, lng: -74.0431 },
  "chandler": { lat: 33.3062, lng: -111.8413 },
  "st. petersburg": { lat: 27.7676, lng: -82.6403 },
  "saint petersburg": { lat: 27.7676, lng: -82.6403 },
  "laredo": { lat: 27.5306, lng: -99.4803 },
  "norfolk": { lat: 36.8508, lng: -76.2859 },
  "madison": { lat: 43.0731, lng: -89.4012 },
  "durham": { lat: 35.994, lng: -78.8986 },
  "lubbock": { lat: 33.5779, lng: -101.8552 },
  "winston-salem": { lat: 36.0999, lng: -80.2442 },
  "garland": { lat: 32.9126, lng: -96.6389 },
  "glendale": { lat: 33.5387, lng: -112.1859 },
  "hialeah": { lat: 25.8576, lng: -80.2781 },
  "reno": { lat: 39.5296, lng: -119.8138 },
  "baton rouge": { lat: 30.4515, lng: -91.1871 },
  "irvine": { lat: 33.6846, lng: -117.8265 },
  "chesapeake": { lat: 36.7682, lng: -76.2875 },
  "scottsdale": { lat: 33.4942, lng: -111.9261 },
  "north las vegas": { lat: 36.1989, lng: -115.1175 },
  "fremont": { lat: 37.5485, lng: -121.9886 },
  "gilbert": { lat: 33.3528, lng: -111.789 },
  "san bernardino": { lat: 34.1083, lng: -117.2898 },
  "boise": { lat: 43.615, lng: -116.2023 },
  "birmingham": { lat: 33.5186, lng: -86.8104 },
  "rochester": { lat: 43.1566, lng: -77.6088 },
  "richmond": { lat: 37.5407, lng: -77.436 },

  // ── 101–200 by population ─────────────────────────────────────────────────
  "spokane": { lat: 47.6588, lng: -117.426 },
  "des moines": { lat: 41.5868, lng: -93.625 },
  "montgomery": { lat: 32.3668, lng: -86.3 },
  "modesto": { lat: 37.6391, lng: -120.9969 },
  "tacoma": { lat: 47.2529, lng: -122.4443 },
  "akron": { lat: 41.0814, lng: -81.519 },
  "shreveport": { lat: 32.5252, lng: -93.7502 },
  "oxnard": { lat: 34.1975, lng: -119.1771 },
  "fontana": { lat: 34.0922, lng: -117.435 },
  "yonkers": { lat: 40.9312, lng: -73.8988 },
  "moreno valley": { lat: 33.9425, lng: -117.2297 },
  "huntington beach": { lat: 33.6595, lng: -117.9988 },
  "salt lake city": { lat: 40.7608, lng: -111.891 },
  "grand rapids": { lat: 42.9634, lng: -85.6681 },
  "amarillo": { lat: 35.222, lng: -101.8313 },
  "knoxville": { lat: 35.9606, lng: -83.9207 },
  "worcester": { lat: 42.2626, lng: -71.8023 },
  "newport news": { lat: 37.0871, lng: -76.473 },
  "huntsville": { lat: 34.7304, lng: -86.5861 },
  "providence": { lat: 41.824, lng: -71.4128 },
  "garden grove": { lat: 33.7743, lng: -117.9379 },
  "tempe": { lat: 33.4255, lng: -111.94 },
  "oceanside": { lat: 33.1959, lng: -117.3795 },
  "rancho cucamonga": { lat: 34.1064, lng: -117.5931 },
  "santa clarita": { lat: 34.3917, lng: -118.5426 },
  "ontario": { lat: 34.0633, lng: -117.6509 },
  "elk grove": { lat: 38.4088, lng: -121.3716 },
  "cape coral": { lat: 26.5629, lng: -81.9495 },
  "fort lauderdale": { lat: 26.1224, lng: -80.1373 },
  "eugene": { lat: 44.0521, lng: -123.0868 },
  "peoria": { lat: 40.6936, lng: -89.589 },
  "corona": { lat: 33.8753, lng: -117.5664 },
  "springfield": { lat: 39.7817, lng: -89.6501 },
  "murfreesboro": { lat: 35.8456, lng: -86.3903 },
  "jackson": { lat: 32.2988, lng: -90.1848 },
  "escondido": { lat: 33.1192, lng: -117.0864 },
  "chattanooga": { lat: 35.0456, lng: -85.3097 },
  "fort collins": { lat: 40.5853, lng: -105.0844 },
  "brownsville": { lat: 25.9017, lng: -97.4975 },
  "little rock": { lat: 34.7465, lng: -92.2896 },
  "overland park": { lat: 38.9822, lng: -94.6708 },
  "sioux falls": { lat: 43.5446, lng: -96.7311 },
  "santa rosa": { lat: 38.4404, lng: -122.7141 },
  "tallahassee": { lat: 30.4518, lng: -84.2807 },
  "mcallen": { lat: 26.2034, lng: -98.23 },
  "fayetteville": { lat: 36.0626, lng: -94.1574 },
  "columbia": { lat: 34.0007, lng: -81.0348 },
  "vancouver": { lat: 45.6387, lng: -122.6615 },
  "pasadena": { lat: 34.1478, lng: -118.1445 },
  "salinas": { lat: 36.6777, lng: -121.6555 },
  "macon": { lat: 32.8407, lng: -83.6324 },
  "torrance": { lat: 33.8358, lng: -118.3406 },
  "pomona": { lat: 34.0551, lng: -117.7499 },
  "hayward": { lat: 37.6688, lng: -122.0808 },
  "clarksville": { lat: 36.5298, lng: -87.3595 },
  "lakewood": { lat: 39.7047, lng: -105.0814 },
  "sunnyvale": { lat: 37.3688, lng: -122.0363 },
  "alexandria": { lat: 38.8048, lng: -77.0469 },
  "roseville": { lat: 38.7521, lng: -121.288 },
  "paterson": { lat: 40.9168, lng: -74.1718 },
  "lansing": { lat: 42.7325, lng: -84.5555 },
  "surprise": { lat: 33.6292, lng: -112.3679 },
  "hollywood": { lat: 26.0112, lng: -80.1495 },
  "mesquite": { lat: 32.7668, lng: -96.5992 },
  "savannah": { lat: 32.0835, lng: -81.0998 },
  "gainesville": { lat: 29.6516, lng: -82.3248 },
  "orange": { lat: 33.7879, lng: -117.8531 },
  "fullerton": { lat: 33.8703, lng: -117.9242 },
  "warren": { lat: 42.4775, lng: -83.0277 },
  "cedar rapids": { lat: 41.9779, lng: -91.6656 },
  "sterling heights": { lat: 42.5803, lng: -83.0302 },
  "topeka": { lat: 39.0473, lng: -95.6752 },
  "elizabeth": { lat: 40.664, lng: -74.2107 },
  "hampton": { lat: 37.0299, lng: -76.3452 },
  "dayton": { lat: 39.7589, lng: -84.1916 },
  "coral springs": { lat: 26.2712, lng: -80.2706 },
  "kent": { lat: 47.3809, lng: -122.2348 },
  "west valley city": { lat: 40.6916, lng: -112.001 },
  "cary": { lat: 35.7915, lng: -78.7811 },
  "lewisville": { lat: 33.0462, lng: -96.9942 },
  "thousand oaks": { lat: 34.1706, lng: -118.8376 },
  "simi valley": { lat: 34.2694, lng: -118.7815 },
  "concord": { lat: 37.978, lng: -122.0311 },
  "hartford": { lat: 41.7658, lng: -72.6851 },
  "victorville": { lat: 34.5362, lng: -117.2928 },
  "midland": { lat: 31.9973, lng: -102.0779 },
  "murrieta": { lat: 33.5539, lng: -117.2139 },

  // ── All 50 State Capitals ─────────────────────────────────────────────────
  "juneau": { lat: 58.3005, lng: -134.4197 },
  "dover": { lat: 39.158, lng: -75.5244 },
  "honolulu": { lat: 21.3069, lng: -157.8583 },
  "frankfort": { lat: 38.2009, lng: -84.8733 },
  "augusta": { lat: 44.3106, lng: -69.7795 },
  "annapolis": { lat: 38.9784, lng: -76.4922 },
  "boston": { lat: 42.3601, lng: -71.0589 },
  "jefferson city": { lat: 38.5767, lng: -92.1735 },
  "helena": { lat: 46.5958, lng: -112.027 },
  "carson city": { lat: 39.1638, lng: -119.7674 },
  "santa fe": { lat: 35.6869, lng: -105.9378 },
  "albany": { lat: 42.6526, lng: -73.7562 },
  "bismarck": { lat: 46.8083, lng: -100.7837 },
  "harrisburg": { lat: 40.2732, lng: -76.8867 },
  "pierre": { lat: 44.3683, lng: -100.351 },
  "montpelier": { lat: 44.2601, lng: -72.5754 },
  "olympia": { lat: 47.0379, lng: -122.9007 },
  "charleston": { lat: 38.3498, lng: -81.6326 },
  "cheyenne": { lat: 41.14, lng: -104.8202 },
  "trenton": { lat: 40.2171, lng: -74.7429 },

  // ── State-qualified alternates for ambiguous cities ───────────────────────
  "new york city": { lat: 40.7128, lng: -74.006 },
  "nyc": { lat: 40.7128, lng: -74.006 },
  "dc": { lat: 38.9072, lng: -77.0369 },
  "washington dc": { lat: 38.9072, lng: -77.0369 },
  "portland or": { lat: 45.5051, lng: -122.675 },
  "portland me": { lat: 43.6591, lng: -70.2568 },
  "springfield il": { lat: 39.7817, lng: -89.6501 },
  "springfield mo": { lat: 37.2153, lng: -93.2982 },
  "springfield ma": { lat: 42.1015, lng: -72.5898 },
  "springfield oh": { lat: 39.9245, lng: -83.8088 },
  "peoria il": { lat: 40.6936, lng: -89.589 },
  "peoria az": { lat: 33.5806, lng: -112.2374 },
  "columbia sc": { lat: 34.0007, lng: -81.0348 },
  "columbia mo": { lat: 38.9517, lng: -92.3341 },
  "columbia md": { lat: 39.2037, lng: -76.8610 },
  "fayetteville nc": { lat: 35.0527, lng: -78.8784 },
  "fayetteville ar": { lat: 36.0626, lng: -94.1574 },
  "glendale az": { lat: 33.5387, lng: -112.1859 },
  "glendale ca": { lat: 34.1425, lng: -118.255 },
  "aurora co": { lat: 39.7294, lng: -104.8319 },
  "aurora il": { lat: 41.7606, lng: -88.3201 },
  "rochester ny": { lat: 43.1566, lng: -77.6088 },
  "rochester mn": { lat: 44.0121, lng: -92.4802 },
  "pasadena ca": { lat: 34.1478, lng: -118.1445 },
  "pasadena tx": { lat: 29.6911, lng: -95.2091 },
  "concord ca": { lat: 37.978, lng: -122.0311 },
  "concord nh": { lat: 43.2081, lng: -71.5376 },
  "richmond va": { lat: 37.5407, lng: -77.436 },
  "richmond ca": { lat: 37.9358, lng: -122.3477 },
  "columbus oh": { lat: 39.9612, lng: -82.9988 },
  "columbus ga": { lat: 32.461, lng: -84.9877 },
  "jackson ms": { lat: 32.2988, lng: -90.1848 },
  "jackson tn": { lat: 35.6145, lng: -88.8139 },
  "augusta ga": { lat: 33.4735, lng: -82.0105 },
  "augusta me": { lat: 44.3106, lng: -69.7795 },
  "charleston sc": { lat: 32.7765, lng: -79.9311 },
  "charleston wv": { lat: 38.3498, lng: -81.6326 },
  "ontario ca": { lat: 34.0633, lng: -117.6509 },
  "ontario or": { lat: 44.0257, lng: -116.9627 },
  "kent wa": { lat: 47.3809, lng: -122.2348 },
  "kent oh": { lat: 41.1536, lng: -81.3582 },
  "midland tx": { lat: 31.9973, lng: -102.0779 },
  "midland mi": { lat: 43.6156, lng: -84.2472 },
  "st. petersburg fl": { lat: 27.7676, lng: -82.6403 },
  "kansas city mo": { lat: 39.0997, lng: -94.5786 },
  "kansas city ks": { lat: 39.1155, lng: -94.6268 },

  // ── NYC Boroughs ──────────────────────────────────────────────────────────
  "brooklyn": { lat: 40.6782, lng: -73.9442 },
  "queens": { lat: 40.7282, lng: -73.7949 },
  "bronx": { lat: 40.8448, lng: -73.8648 },
  "staten island": { lat: 40.5795, lng: -74.1502 },

  // ── Additional mid-size & notable cities ──────────────────────────────────

  // Alaska
  "fairbanks": { lat: 64.8378, lng: -147.7164 },

  // Arizona
  "flagstaff": { lat: 35.1983, lng: -111.6513 },
  "yuma": { lat: 32.6927, lng: -114.6277 },

  // Arkansas
  "fort smith": { lat: 35.385, lng: -94.3985 },
  "jonesboro": { lat: 35.8423, lng: -90.7043 },

  // California
  "chula vista": { lat: 32.6401, lng: -117.0842 },
  "vallejo": { lat: 38.1041, lng: -122.2566 },
  "antioch": { lat: 38.0049, lng: -121.8058 },
  "berkeley": { lat: 37.8716, lng: -122.2727 },
  "santa clara": { lat: 37.3541, lng: -121.9552 },
  "ventura": { lat: 34.274, lng: -119.229 },
  "inglewood": { lat: 33.9617, lng: -118.3531 },
  "santa barbara": { lat: 34.4208, lng: -119.6982 },
  "san luis obispo": { lat: 35.2828, lng: -120.6596 },
  "redding": { lat: 40.5865, lng: -122.3917 },
  "visalia": { lat: 36.33, lng: -119.2921 },
  "palmdale": { lat: 34.5794, lng: -118.1165 },
  "lancaster": { lat: 34.6868, lng: -118.1542 },

  // Colorado
  "pueblo": { lat: 38.2544, lng: -104.6091 },
  "boulder": { lat: 40.015, lng: -105.2705 },
  "greeley": { lat: 40.4233, lng: -104.7091 },

  // Connecticut
  "bridgeport": { lat: 41.1865, lng: -73.1952 },
  "new haven": { lat: 41.3082, lng: -72.9282 },
  "stamford": { lat: 41.0534, lng: -73.5387 },
  "waterbury": { lat: 41.5582, lng: -73.0515 },

  // Delaware
  "wilmington": { lat: 39.7447, lng: -75.5484 },

  // Florida
  "port st. lucie": { lat: 27.273, lng: -80.3582 },
  "port saint lucie": { lat: 27.273, lng: -80.3582 },
  "pembroke pines": { lat: 26.0074, lng: -80.2962 },
  "miramar": { lat: 25.9872, lng: -80.2322 },
  "clearwater": { lat: 27.9659, lng: -82.8001 },
  "west palm beach": { lat: 26.7153, lng: -80.0534 },
  "lakeland": { lat: 28.0395, lng: -81.9498 },
  "palm bay": { lat: 28.0345, lng: -80.5887 },
  "north charleston": { lat: 32.8546, lng: -79.9748 },

  // Georgia
  "athens": { lat: 33.9519, lng: -83.3576 },

  // Hawaii
  "kailua": { lat: 21.4022, lng: -157.7394 },
  "hilo": { lat: 19.7297, lng: -155.09 },

  // Idaho
  "nampa": { lat: 43.5407, lng: -116.5635 },
  "meridian": { lat: 43.6121, lng: -116.3915 },

  // Illinois
  "rockford": { lat: 42.2711, lng: -89.094 },
  "joliet": { lat: 41.525, lng: -88.0817 },
  "naperville": { lat: 41.7508, lng: -88.1535 },
  "evanston": { lat: 42.0451, lng: -87.6877 },
  "elgin": { lat: 42.0354, lng: -88.2826 },
  "waukegan": { lat: 42.3636, lng: -87.8448 },

  // Indiana
  "evansville": { lat: 37.9716, lng: -87.5711 },
  "south bend": { lat: 41.6764, lng: -86.252 },
  "carmel": { lat: 39.9784, lng: -86.118 },
  "fishers": { lat: 39.9556, lng: -86.0138 },
  "hammond": { lat: 41.6306, lng: -87.5 },
  "gary": { lat: 41.5934, lng: -87.3464 },

  // Iowa
  "davenport": { lat: 41.5236, lng: -90.5776 },
  "sioux city": { lat: 42.4999, lng: -96.4003 },
  "iowa city": { lat: 41.6611, lng: -91.5302 },

  // Kansas
  "olathe": { lat: 38.8814, lng: -94.8191 },

  // Kentucky
  "bowling green": { lat: 36.9685, lng: -86.4808 },

  // Louisiana
  "metairie": { lat: 29.9946, lng: -90.1634 },
  "lafayette": { lat: 30.2241, lng: -92.0198 },

  // Maine
  "lewiston": { lat: 44.1004, lng: -70.2148 },

  // Maryland
  "rockville": { lat: 39.084, lng: -77.1528 },

  // Massachusetts
  "lowell": { lat: 42.6334, lng: -71.3162 },
  "cambridge": { lat: 42.3736, lng: -71.1097 },

  // Michigan
  "detroit": { lat: 42.3314, lng: -83.0458 },
  "ann arbor": { lat: 42.2808, lng: -83.743 },
  "flint": { lat: 43.0125, lng: -83.6875 },
  "dearborn": { lat: 42.3223, lng: -83.1763 },

  // Minnesota
  "duluth": { lat: 46.7867, lng: -92.1005 },
  "bloomington": { lat: 44.8408, lng: -93.3777 },

  // Mississippi
  "gulfport": { lat: 30.3674, lng: -89.0928 },
  "hattiesburg": { lat: 31.3271, lng: -89.2903 },

  // Missouri
  "independence": { lat: 39.0911, lng: -94.4155 },

  // Montana
  "billings": { lat: 45.7833, lng: -108.5007 },
  "missoula": { lat: 46.8721, lng: -113.994 },
  "great falls": { lat: 47.5002, lng: -111.3008 },

  // Nebraska
  "bellevue": { lat: 41.1544, lng: -95.9146 },

  // New Hampshire
  "manchester": { lat: 42.9956, lng: -71.4548 },
  "nashua": { lat: 42.7654, lng: -71.4676 },

  // New Mexico
  "las cruces": { lat: 32.3199, lng: -106.7637 },
  "rio rancho": { lat: 35.2328, lng: -106.663 },

  // New York
  "syracuse": { lat: 43.0481, lng: -76.1474 },

  // North Carolina
  "greenville nc": { lat: 35.6127, lng: -77.3663 },

  // North Dakota
  "fargo": { lat: 46.8772, lng: -96.7898 },
  "grand forks": { lat: 47.9253, lng: -97.0329 },

  // Ohio
  "youngstown": { lat: 41.0998, lng: -80.6495 },
  "canton": { lat: 40.7989, lng: -81.3784 },

  // Oklahoma
  "norman": { lat: 35.2226, lng: -97.4395 },
  "broken arrow": { lat: 36.0526, lng: -95.7908 },

  // Oregon
  "gresham": { lat: 45.5001, lng: -122.4302 },
  "hillsboro": { lat: 45.5229, lng: -122.9898 },
  "beaverton": { lat: 45.4871, lng: -122.8037 },
  "medford": { lat: 42.3265, lng: -122.8756 },

  // Pennsylvania
  "allentown": { lat: 40.6023, lng: -75.4714 },
  "erie": { lat: 42.1292, lng: -80.0851 },
  "reading": { lat: 40.3356, lng: -75.9269 },
  "scranton": { lat: 41.409, lng: -75.6624 },

  // Rhode Island
  "warwick": { lat: 41.7001, lng: -71.4162 },

  // South Carolina
  "greenville": { lat: 34.8526, lng: -82.394 },

  // South Dakota
  "rapid city": { lat: 44.0805, lng: -103.231 },

  // Tennessee
  "johnson city": { lat: 36.3134, lng: -82.3535 },
  "kingsport": { lat: 36.5484, lng: -82.5618 },

  // Texas
  "waco": { lat: 31.5493, lng: -97.1467 },
  "killeen": { lat: 31.1171, lng: -97.7278 },
  "beaumont": { lat: 30.0802, lng: -94.1266 },
  "abilene": { lat: 32.4487, lng: -99.7331 },
  "odessa": { lat: 31.8457, lng: -102.3676 },
  "round rock": { lat: 30.5082, lng: -97.6789 },
  "denton": { lat: 33.2148, lng: -97.1331 },
  "tyler": { lat: 32.3513, lng: -95.3011 },
  "carrollton": { lat: 32.9537, lng: -96.8903 },
  "frisco": { lat: 33.1507, lng: -96.8236 },
  "mckinney": { lat: 33.1972, lng: -96.6397 },
  "grand prairie": { lat: 32.746, lng: -97.0 },
  "irving": { lat: 32.814, lng: -96.9489 },
  "port arthur": { lat: 29.885, lng: -93.9399 },
  "sugar land": { lat: 29.6197, lng: -95.6349 },
  "pearland": { lat: 29.5635, lng: -95.2860 },

  // Utah
  "provo": { lat: 40.2338, lng: -111.6585 },
  "west jordan": { lat: 40.6097, lng: -111.9391 },
  "orem": { lat: 40.2969, lng: -111.6946 },
  "sandy": { lat: 40.5649, lng: -111.8388 },
  "st. george": { lat: 37.0965, lng: -113.5684 },
  "saint george": { lat: 37.0965, lng: -113.5684 },
  "ogden": { lat: 41.223, lng: -111.9738 },

  // Vermont
  "burlington": { lat: 44.4759, lng: -73.2121 },

  // Virginia
  "roanoke": { lat: 37.271, lng: -79.9414 },
  "chesapeake va": { lat: 36.7682, lng: -76.2875 },

  // Washington
  "bellevue wa": { lat: 47.6101, lng: -122.2015 },
  "everett": { lat: 47.979, lng: -122.2021 },
  "renton": { lat: 47.4829, lng: -122.2171 },
  "spokane valley": { lat: 47.6732, lng: -117.2394 },
  "kirkland": { lat: 47.6815, lng: -122.2087 },
  "bellingham": { lat: 48.7519, lng: -122.4787 },
  "yakima": { lat: 46.6021, lng: -120.5059 },

  // West Virginia
  "huntington": { lat: 38.4192, lng: -82.4452 },

  // Wisconsin
  "green bay": { lat: 44.5133, lng: -88.0133 },
  "kenosha": { lat: 42.5847, lng: -87.8212 },
  "racine": { lat: 42.7261, lng: -87.7829 },
  "appleton": { lat: 44.2619, lng: -88.4154 },

  // Wyoming
  "casper": { lat: 42.8501, lng: -106.3252 },

  // ── DragonCandy market / creator cities not in the population-ranked set ──
  "hoboken": { lat: 40.7439, lng: -74.0324 }, // HQ city
  "palm beach": { lat: 26.7056, lng: -80.0364 }, // distinct from West Palm Beach
  "bolinas": { lat: 37.9091, lng: -122.6864 },
};
