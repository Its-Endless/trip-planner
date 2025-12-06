# 🌍 Trip Planner & Companion Finder

A modern web platform designed to help people **travel smarter, feel less isolated, and build real human connections through shared journeys**.

---

## ❤️ Why This Project Matters

In today’s world, people are more connected digitally than ever — yet **lonelier than ever**.
Many individuals want to explore new places, plan trips, or even go out for a simple day trip, but hesitate because:

* They don’t have a travel companion
* Planning feels overwhelming
* Going alone feels unsafe or emotionally draining

Isolation affects mental health, confidence, and overall life satisfaction.

**This project is built to solve that.**

---

## 🤝 Companion Mode – Travel Together, Not Alone

One of the core features of this platform is **Companion Mode**.

Users can:

* Share their trip plans publicly
* Discover others planning similar trips
* Find people who want to go to the **same destination, on similar dates**
* Connect and travel together safely and meaningfully

This encourages:

* Real-world social interaction
* Reduced loneliness
* Shared experiences instead of solo isolation
* Stronger communities formed through travel

> Travel becomes not just about destinations — but about people.

---

## ✨ Features

### 🧭 Trip Planning

* Plan multi-day trips with destinations, preferences, and timelines
* AI-powered itinerary generation
* Smart suggestions based on location

### 🌤️ Day Out Mode

* Quick planning for nearby hangouts or short outings
* Uses live location and map integration

### 🤝 Companion Mode (Social Impact Core)

* Public trip sharing
* Discover trips shared by others
* Find potential travel companions
* Encourage safe and social exploration

### 🗺️ Interactive Maps

* Live map visualization using **Leaflet.js**
* Automatically centers based on user location

### 🔐 Authentication

* Secure login and signup powered by **Supabase**
* User-specific trip history and favorites

### 📜 Trip History

* Automatically saves previous trips
* Easily revisit, reuse, or share plans

---

## 🛠️ Tech Stack

### Frontend

* **HTML5**
* **CSS3**
* **Vanilla JavaScript**
* **Leaflet.js** for maps

### Backend & Automation

* **n8n** (workflow automation & backend logic)

  * Handles trip processing
  * Integrates external APIs
  * Connects AI/logic pipelines
  * Manages companion matching workflows

### Database & Auth

* **Supabase**

  * Authentication
  * User data
  * Trip storage
  * Secure access with RLS

### Hosting

* Fully static frontend (GitHub Pages / Netlify compatible)
* Backend workflows deployed via n8n

---

## 🧠 Architecture Overview

```
Frontend (HTML/CSS/JS)
        ↓
n8n Workflows (Backend Logic)
        ↓
External APIs / AI Services
        ↓
Supabase (Auth + Storage)
```

This separation keeps the frontend fast, secure, and scalable.

---

## 🌱 Social Impact

This project isn’t just about code.

It aims to:

* Reduce loneliness through shared experiences
* Encourage people to step outside their comfort zones
* Promote healthier social habits
* Make travel more accessible and emotionally rewarding
* Build a sense of belonging through community-based planning

Even one meaningful trip with the right people can change someone’s outlook on life.

---

## 🚀 Getting Started Locally

1. Clone the repository

```bash
git clone https://github.com/your-username/trip-planner.git
```

2. Open `index.html` in your browser
   (No build tools required)

3. Configure your:

* n8n webhook URLs
* Supabase credentials

---

## 🔄 Updating the Website

* Modify frontend files (`index.html`, `trip-planner.html`, `styles.css`, `script.js`)
* Push changes to GitHub
* Hosting platform automatically redeploys

No downtime. No manual deployment steps.

---

## 🔒 Security Notes

* Supabase uses Row Level Security (RLS)
* Public keys are safe by design
* Sensitive logic remains inside n8n workflows
* HTTPS enforced by hosting provider

---

## 📌 Future Enhancements

* In-app messaging between companions
* Trust & verification system
* AI-based compatibility scoring
* Calendar sync
* Mobile-first PWA support

---

## 🧡 Final Note

This project is a reminder that **technology should bring people together, not push them further apart**.

If this platform helps even one person feel less alone while exploring the world — it has already succeeded.

---
* Create a **pitch description**
* Or help you brand this as a real product 💡
