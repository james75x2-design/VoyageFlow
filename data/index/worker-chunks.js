// Auto-generated from chunks.jsonl. Do not edit by hand.
// Regenerate with: node scripts/build-worker-chunks.mjs
export const TRAVEL_CHUNKS = [
  {
    "chunk_id": "booking-policies::001",
    "section": "What VoyageFlow Can Guarantee",
    "source_path": "data/kb/booking-policies.md",
    "text": "## What VoyageFlow Can Guarantee\n\nVoyageFlow guarantees the following:\n\n- Itineraries are generated using its curated destination knowledge base\n- Booking links are correctly formatted and point to legitimate partner platforms\n- Trip context (dates, destinations, traveler count) is passed accurately to partner search pages\n- All recommendations are grounded in the VoyageFlow knowledge base with visible citations"
  },
  {
    "chunk_id": "booking-policies::002",
    "section": "What VoyageFlow Cannot Guarantee",
    "source_path": "data/kb/booking-policies.md",
    "text": "## What VoyageFlow Cannot Guarantee\n\nVoyageFlow **cannot** guarantee:\n\n- **Hotel availability** at the time of booking — inventory changes minute to minute on partner platforms\n- **Hotel prices** — rates fluctuate based on demand, promotions, and partner platform dynamics\n- **Flight availability or fares** — airline pricing is dynamic and not stored inside VoyageFlow\n- **Cancellation or refund outcomes** — these are governed by the partner platform's terms, not by VoyageFlow\n- **Visa approvals, entry permissions, or health clearances** — these are the traveler's responsibility\n\nUsers must confirm all pricing, availability, and policies directly with the booking partner before completing payment."
  },
  {
    "chunk_id": "booking-policies::003",
    "section": "Verifying Information Before Booking",
    "source_path": "data/kb/booking-policies.md",
    "text": "## Verifying Information Before Booking\n\nVoyageFlow strongly encourages users to verify the following before finalizing any booking:\n\n- Current price on the partner platform (VoyageFlow does not display live prices)\n- Cancellation policy and refund window\n- Room type, bed configuration, and included amenities\n- Total cost including taxes, fees, and resort charges\n- Passport validity and visa requirements for the destination"
  },
  {
    "chunk_id": "booking-policies::004",
    "section": "Out-of-Scope Topics",
    "source_path": "data/kb/booking-policies.md",
    "text": "## Out-of-Scope Topics\n\nVoyageFlow does not provide:\n\n- Medical advice for travel — users should consult a licensed physician or travel medicine clinic\n- Legal advice about visas, immigration, or customs\n- Real-time weather forecasts or emergency alerts\n- Personal financial or insurance recommendations\n\nFor these topics, VoyageFlow directs users to appropriate licensed professionals or official government resources."
  },
  {
    "chunk_id": "tokyo-spring-guide::001",
    "section": "Overview",
    "source_path": "data/kb/tokyo-spring-guide.md",
    "text": "## Overview\n\nSpring in Tokyo runs from March through May and is one of the most popular times to visit. The season is defined by cherry blossom (sakura) viewing, mild temperatures (10–20°C / 50–68°F), and a packed cultural calendar. VoyageFlow recommends booking accommodations 3–6 months in advance for late March and early April travel."
  },
  {
    "chunk_id": "tokyo-spring-guide::002",
    "section": "Cherry Blossom Season",
    "source_path": "data/kb/tokyo-spring-guide.md",
    "text": "## Cherry Blossom Season\n\nPeak sakura typically falls between late March and early April, though exact dates shift year to year based on weather. VoyageFlow surfaces top hanami (flower viewing) spots including Ueno Park, Shinjuku Gyoen, Chidorigafuchi, and the Meguro River. For the most current bloom forecast, VoyageFlow suggests users check the Japan Meteorological Corporation's annual sakura report."
  },
  {
    "chunk_id": "tokyo-spring-guide::003",
    "section": "Suggested Spring Itinerary",
    "source_path": "data/kb/tokyo-spring-guide.md",
    "text": "## Suggested Spring Itinerary\n\nA typical VoyageFlow-generated 5-day Tokyo spring itinerary covers:\n\n- **Day 1:** Arrival, Shinjuku exploration, evening at Omoide Yokocho\n- **Day 2:** Asakusa, Senso-ji Temple, Sumida River sakura cruise\n- **Day 3:** Harajuku, Meiji Shrine, Yoyogi Park hanami picnic\n- **Day 4:** Day trip to Kamakura or Nikko for temple visits and gardens\n- **Day 5:** Ueno Park, museum district, departure\n\nVoyageFlow adjusts itineraries based on trip length, traveler pace, and interests such as food, culture, shopping, or nightlife."
  },
  {
    "chunk_id": "tokyo-spring-guide::004",
    "section": "Booking Considerations",
    "source_path": "data/kb/tokyo-spring-guide.md",
    "text": "## Booking Considerations\n\nSpring is peak season, and VoyageFlow flags several booking constraints:\n\n- Hotel rates in central Tokyo (Shinjuku, Shibuya, Ginza) can be 30–50% higher during sakura week\n- Flights from North America and Europe often sell out 2–3 months ahead for late-March travel\n- Popular ryokan (traditional inns) require booking 4–6 months in advance\n- Restaurant reservations at high-demand venues should be secured before arrival\n\nVoyageFlow generates booking links with these date-specific considerations pre-filled, but final pricing and availability must be confirmed on partner platforms."
  },
  {
    "chunk_id": "voyageflow-overview::001",
    "section": "What Is VoyageFlow?",
    "source_path": "data/kb/voyageflow-overview.md",
    "text": "## What Is VoyageFlow?\n\nVoyageFlow is an AI travel concierge that helps travelers plan trips, discover destinations, and generate ready-to-book itineraries. It provides destination guidance, day-by-day itineraries, and structured booking links for hotels and flights. VoyageFlow does not process payments directly — it hands users off to trusted booking partners."
  },
  {
    "chunk_id": "voyageflow-overview::002",
    "section": "How VoyageFlow Handles Hotels and Flights",
    "source_path": "data/kb/voyageflow-overview.md",
    "text": "## How VoyageFlow Handles Hotels and Flights\n\nVoyageFlow supports two primary booking flows:\n\n- **Hotels:** VoyageFlow surfaces hotel recommendations based on user preferences (budget, neighborhood, amenities) and generates deep booking links to partner platforms including Booking.com, Expedia, and Agoda. Users complete the actual booking on the partner site.\n- **Flights:** VoyageFlow generates flight search links pre-filled with origin, destination, and dates. Supported partners include Google Flights, Skyscanner, and Kayak. Real-time seat availability is not stored inside VoyageFlow.\n\nVoyageFlow does not act as a travel agent, an Online Travel Agency (OTA), or a merchant of record. All transactions occur on partner platforms."
  },
  {
    "chunk_id": "voyageflow-overview::003",
    "section": "Booking Links VoyageFlow Generates",
    "source_path": "data/kb/voyageflow-overview.md",
    "text": "## Booking Links VoyageFlow Generates\n\nWhen a user confirms a plan, VoyageFlow generates a structured **Booking Demand Card** containing:\n\n- A hotel search link pre-filled with destination, check-in date, check-out date, and guest count\n- A flight search link pre-filled with origin airport, destination airport, and travel dates\n- An activities/experiences link (via GetYourGuide or Viator) when relevant\n- A summary of the trip context for the user's records\n\nThese links are deep-linked search URLs, not confirmed bookings. Users must complete their reservation on the destination platform."
  },
  {
    "chunk_id": "voyageflow-overview::004",
    "section": "Verification and Disclaimers",
    "source_path": "data/kb/voyageflow-overview.md",
    "text": "## Verification and Disclaimers\n\nVoyageFlow always recommends users verify travel information before booking, including:\n\n- Current pricing and availability on the partner platform\n- Visa and entry requirements for the destination country\n- Local health advisories and travel warnings\n- Cancellation and refund policies specific to the booking\n\nVoyageFlow surfaces general destination guidance based on its knowledge base, but pricing, availability, and policies can change without notice. Users are responsible for confirming all details before payment."
  }
];
