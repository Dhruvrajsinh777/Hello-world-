// Product catalog. Replace `image` with real photo URLs when available;
// until then each card shows a styled motif placeholder.
const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "poshak", label: "Rajputi Poshak" },
  { id: "odhna", label: "Odhna & Dupatta" },
  { id: "men", label: "Men's Attire" },
  { id: "jewelry", label: "Jewellery" },
  { id: "bridal", label: "Bridal Sets" },
];

const PRODUCTS = [
  { id: 1, name: "Pure Georgette Rajputi Poshak", category: "poshak", price: 18500, mrp: 22000, fabric: "Pure georgette, hand gota-patti", colors: ["Rani Pink", "Peela"], motif: "👗", tag: "Bestseller", desc: "Four-piece poshak (kurti, kanchli, lehenga, odhna) with hand-done gota-patti and zari border." },
  { id: 2, name: "Chiffon Poshak with Aari Work", category: "poshak", price: 14200, mrp: 16500, fabric: "Chiffon, aari embroidery", colors: ["Maroon", "Mehendi Green"], motif: "👗", desc: "Lightweight festive poshak with fine aari work on the kurti and lehenga hem." },
  { id: 3, name: "Bandhej Rajputi Poshak", category: "poshak", price: 12800, mrp: 14000, fabric: "Georgette bandhej", colors: ["Lehariya Red", "Kesariya"], motif: "👗", tag: "New", desc: "Traditional tie-dye bandhej poshak, ideal for Teej and Gangaur." },
  { id: 4, name: "Lehariya Odhna", category: "odhna", price: 3200, mrp: 3800, fabric: "Chiffon lehariya", colors: ["Saawan Green", "Pink-Yellow"], motif: "🧣", desc: "Wave-pattern lehariya odhna with gota lace on all four sides." },
  { id: 5, name: "Gota Patti Odhna", category: "odhna", price: 4500, mrp: 5200, fabric: "Georgette, gota patti", colors: ["Red", "Royal Blue"], motif: "🧣", tag: "Bestseller", desc: "Heavy gota-patti buti all over with a broad zari border." },
  { id: 6, name: "Jodhpuri Bandhgala Suit", category: "men", price: 16000, mrp: 19000, fabric: "Raw silk", colors: ["Ivory", "Navy"], motif: "🤵", desc: "Tailored bandhgala with breeches, antique buttons and silk lining." },
  { id: 7, name: "Royal Achkan Sherwani", category: "men", price: 24500, mrp: 28000, fabric: "Brocade silk", colors: ["Gold", "Maroon"], motif: "🤵", tag: "Wedding", desc: "Knee-length achkan with zardozi collar, paired with churidar." },
  { id: 8, name: "Rajputi Safa (Pagdi)", category: "men", price: 1800, mrp: 2200, fabric: "Cotton bandhej", colors: ["Kesariya", "Lehariya"], motif: "👳", desc: "Hand-tied 9-metre safa. Pre-tied option available on request." },
  { id: 9, name: "Kundan Borla (Rakhdi)", category: "jewelry", price: 6800, mrp: 7900, fabric: "Kundan, gold-plated silver", colors: ["Gold"], motif: "🔱", tag: "Bestseller", desc: "Signature Rajputi forehead ornament with kundan stones and pearl drops." },
  { id: 10, name: "Aad Necklace", category: "jewelry", price: 22000, mrp: 26000, fabric: "Kundan-meena, 22K plated", colors: ["Gold-Red", "Gold-Green"], motif: "📿", desc: "Traditional broad choker-style aad with meenakari back." },
  { id: 11, name: "Timaniya Choker", category: "jewelry", price: 15500, mrp: 18000, fabric: "Polki, gold-plated", colors: ["Gold"], motif: "📿", desc: "Three-strand timaniya with polki squares on silk dori." },
  { id: 12, name: "Rajputi Nath", category: "jewelry", price: 3900, mrp: 4500, fabric: "Kundan with pearl chain", colors: ["Gold"], motif: "💍", desc: "Large bridal nath with pearl string that clips to the hair." },
  { id: 13, name: "Bajuband (Armlet) Pair", category: "jewelry", price: 5600, mrp: 6500, fabric: "Kundan, adjustable dori", colors: ["Gold"], motif: "💫", desc: "Adjustable armlets with kundan floral motif and tassels." },
  { id: 14, name: "Rajputi Payal (Kadi)", category: "jewelry", price: 4200, mrp: 4800, fabric: "Oxidised silver", colors: ["Silver"], motif: "✨", desc: "Heavy traditional anklet pair with ghungroo." },
  { id: 15, name: "Hathphool Pair", category: "jewelry", price: 2900, mrp: 3400, fabric: "Kundan-meena", colors: ["Gold-Red"], motif: "🖐️", desc: "Ring-to-wrist hand ornament with meena work." },
  { id: 16, name: "Ivory-look Rajputi Chooda", category: "jewelry", price: 7800, mrp: 9000, fabric: "Acrylic with gold work", colors: ["White-Gold", "Red-Gold"], motif: "⭕", desc: "Full-arm traditional chooda set. Specify wrist size at checkout." },
  { id: 17, name: "Complete Bridal Jewellery Set", category: "bridal", price: 68000, mrp: 79000, fabric: "Kundan-polki, 22K plated", colors: ["Gold"], motif: "👑", tag: "Bridal", desc: "Borla, aad, timaniya, nath, bajuband, hathphool, payal and earrings." },
  { id: 18, name: "Bridal Poshak + Jewellery Combo", category: "bridal", price: 95000, mrp: 112000, fabric: "Pure silk poshak, kundan set", colors: ["Red", "Rani Pink"], motif: "👑", tag: "Bridal", desc: "Heavy zardozi bridal poshak with a full matching kundan jewellery set." },
];
