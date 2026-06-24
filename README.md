VoyageFlow — Premium AI-Powered Travel Concierge ✈️🌴

VoyageFlow is a high-end, zero-friction AI travel assistant designed to turn natural conversations into beautiful, bespoke day-by-day itineraries and instantly bookable travel resources.

Users can map out custom trips, and VoyageFlow instantly generates a Premium Travel Booking Desk featuring pre-populated deep-links with precise locations, dates, and traveler counts for flights, hotels, tours, and travel insurance.

🏗️ Repository Architecture

This repository organizes the VoyageFlow codebase into a clean, easily deployable structure:

voyageflow/
├── .gitignore          # Prevents tracking temporary local files/dependencies
├── LICENSE.md          # Open-source MIT License
├── README.md           # This comprehensive guide
├── index.html          # Single-file static web client (Pure HTML/CSS/JS with full deep-linking logic)
└── worker.js           # Cloudflare Serverless Worker (Gemini 1.5 Pro + Groq Failover Gateway)


⚡ Key Features

Dual-Model Smart AI Routing: The serverless gateway is powered primarily by Google Gemini 1.5 Pro for world-class reasoning and luxurious itinerary writing. If Gemini encounters an API outage or rate limit (429), the backend silently catches the failure and immediately routes the prompt through the ultra-fast Groq API (llama-3.3-70b-versatile) as a fallback.

Pre-populated Booking Engines:

🏨 Hotels (Booking.com): Fully parses adult and room counts, child counts, and individual child ages to open search listings with the exact booking matrix.

✈️ Flights (Google Flights): Built using an advanced NLP query formatter (Flights to [Destination] on [Check-In] returning [Check-Out] with X adults and Y children).

🏝️ Smart Regional Mapping: Google Flights automatically discards dates and forces users into a generic "Explore Map" view if given broad country/island terms (like "Maldives", "Bali", or "Hawaii"). VoyageFlow intercepts these terms and silently translates them to primary regional airport codes (MLE, DPS, HNL) specifically for the flight generator, keeping strict search parameters locked.

🎟️ Experiences (GetYourGuide): Passes exact destination, dates, and guests directly using a validated, non-breaking URL directory structure.

🛡️ Travel Insurance (VisitorsCoverage): Routes users to a premium global travel protection hub with dates and destinations pre-filled.

Cookie-Based memory: Remembers the user's last planned destination across browser sessions to customize interactive prompt suggestions on return.

Glassmorphism UI: Elegant responsive dark-mode styling with a responsive mobile chat interface, beautiful transition animations, and custom dialogue overlays.

🚀 Step-by-Step Deployment Guide

You can launch VoyageFlow to production in under 5 minutes.

Step 1: Deploy the Cloudflare Backend Worker

Create a free account at Cloudflare.

Create a new Worker (e.g., named voyageflow-api).

Copy the contents of your worker.js file and paste them into the Cloudflare Worker script editor. Save and deploy.

Go to Settings > Variables inside your Worker's dashboard.

Add the following Secrets (do not save them as plain-text environment variables):

GEMINI_API_KEY: Get a free key from the Google AI Studio Console.

GROQ_API_KEY: Get a free key from the Groq Console.

Copy your public worker route URL (e.g., https://voyageflow-api.yourname.workers.dev).

Step 2: Configure the Frontend Client

Open index.html in your local text editor.

Near the top of the <script> tag, find the configuration constant:

const WORKER_URL = 'https://your-worker-subdomain.workers.dev';


Replace the placeholder string with your live Cloudflare Worker URL.

Step 3: Set Up Affiliate Monetization

To earn commissions from user bookings, swap out the placeholder tracking parameters inside the createBookingDemandCard function of index.html:

Booking.com: Replace the BOOKING_AID variable with your Booking Affiliate ID.

GetYourGuide: Replace the partner_id parameter inside the experiencesUrl template string.

VisitorsCoverage: Append your partner marker ID to the insuranceUrl query string.

Step 4: Host Your Frontend

Since index.html is a single static file, you can host it for free on:

Cloudflare Pages (Highly Recommended): Drag-and-drop the file to place your frontend and backend under the same secure, CDN-optimized roof.

Netlify or Vercel: Simply drag and drop your project folder onto their platforms for instant hosting.

📄 License

This project is licensed under the MIT License. Feel free to customize, fork, and monetize!
