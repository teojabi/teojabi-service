// Local crawl is sale-only (crawl.py j=1); observed pt=0, p>0.
// t=1 land / t=5 building and dt=6 / drt=5 confirmed by the user.
// Currency: local match_disco.py and fast_match.py compare p directly to
// commercial sale prices in MANWON. Coordinates: _fill_disco_geom.py.
// t=12 is deliberately excluded until the stored dataset mapping is confirmed.
export const DISCO_CONTRACT=Object.freeze({
  confirmed:true, coordinates:'EPSG:4326', priceUnit:'MANWON',
  salePtValues:[0], kindByT:{1:'land',5:'building'},
});
