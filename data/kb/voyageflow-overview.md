# VoyageFlow Overview

## What Is VoyageFlow?

VoyageFlow is an AI travel concierge that helps travelers plan trips, discover destinations, and generate ready-to-book itineraries. It provides destination guidance, day-by-day itineraries, and structured booking links for hotels and flights. VoyageFlow does not process payments directly — it hands users off to trusted booking partners.

## How VoyageFlow Handles Hotels and Flights

VoyageFlow supports two primary booking flows:

- **Hotels:** VoyageFlow surfaces hotel recommendations based on user preferences (budget, neighborhood, amenities) and generates deep booking links to partner platforms including Booking.com, Expedia, and Agoda. Users complete the actual booking on the partner site.
- **Flights:** VoyageFlow generates flight search links pre-filled with origin, destination, and dates. Supported partners include Google Flights, Skyscanner, and Kayak. Real-time seat availability is not stored inside VoyageFlow.

VoyageFlow does not act as a travel agent, an Online Travel Agency (OTA), or a merchant of record. All transactions occur on partner platforms.

## Booking Links VoyageFlow Generates

When a user confirms a plan, VoyageFlow generates a structured **Booking Demand Card** containing:

- A hotel search link pre-filled with destination, check-in date, check-out date, and guest count
- A flight search link pre-filled with origin airport, destination airport, and travel dates
- An activities/experiences link (via GetYourGuide or Viator) when relevant
- A summary of the trip context for the user's records

These links are deep-linked search URLs, not confirmed bookings. Users must complete their reservation on the destination platform.

## Verification and Disclaimers

VoyageFlow always recommends users verify travel information before booking, including:

- Current pricing and availability on the partner platform
- Visa and entry requirements for the destination country
- Local health advisories and travel warnings
- Cancellation and refund policies specific to the booking

VoyageFlow surfaces general destination guidance based on its knowledge base, but pricing, availability, and policies can change without notice. Users are responsible for confirming all details before payment.