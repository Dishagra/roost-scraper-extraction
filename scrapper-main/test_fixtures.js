// Test fixtures transcribed from real FB/WhatsApp posts (user-provided screenshots).
// Run: node run_tests.js
const FIXTURES = [
  {
    name: "1. Nidhi Tiwari — flatmate wanted (LISTER, was misclassified as finder)",
    post: {
      text: `URGENT! LOOKING FOR A FEMALE FLATMATE (double occupancy)- 3Bhk Furnished Apartment.
Hey Girls!
Looking for a Female Flatmate to occupy 1 master bedroom- Move In 1 July 2026 - 3 bhk at Hill Ridge Springs, Gachibowli (Gated community with amenities)
No restrictions. Chill flatmates
Details:
3BHK Furnished flat in Hill Ridge Springs
ISB Road, Gachibowli
Availability: 1st July 2026
Room Details:
Your room has the attached washroom
Spacious Wardrobe
AC
Bed (mattress is included)
Geyser..
The flat also comes with a good modular kitchen, chimney, sofa and a common balcony.
You'll have to pay -
Rent - 13000/ month (per person)
No setup cost
Security Deposit - 2 months rent (refundable from the next tenant)
Electricity/Maid/Gas/ wifi to be equally split.
Society has
1. Gym
2. Badminton court
3. Table tennis indoor area
4. children play area
5. Grocery store
6. medical center
7. swimming pool with beautiful view
8. 24x7 electricity and water with backup
DM if interested.`,
      images: ["https://scontent.example/room1.jpg"],
      permalink: "https://www.facebook.com/groups/x/posts/1001",
      postCreatedAt: "2026-06-09T22:19:00Z",
      author: "Nidhi Tiwari"
    }
  },
  {
    name: "2. Korra Rocky — 2bhk Kondapur (LISTER)",
    post: {
      text: `2bhk fully furnished flat in Kondapur 9059587523
This property beautifully designed with all the modern-day comforts in this locality. Property on rent available at affordable price in posh locality of Hyderabad
This residential property is near School,Malls,Bus stop and Supermarket available. It is also close to Hospitals also.
Contact now for more information 9059587523`,
      images: ["https://scontent.example/k1.jpg", "https://scontent.example/k2.jpg"],
      permalink: "https://www.facebook.com/groups/x/posts/1002",
      postCreatedAt: "2026-06-12T09:00:00Z",
      author: "Korra Rocky"
    }
  },
  {
    name: "3. Akhil rentals — 1bhk Kondapur (LISTER, broker-pattern name)",
    post: {
      text: `Akhil rentals 9398699634 1bhk fully New furnished flat available
Rent kondapur furnished flat ready to move option available Sri ram Nagar colony and Raghavendra Colony and RTO office Masjid Banda area beautiful area full security brand new items bed and market and schools and hospital nearby main road and left and power backup and family and bachelors 9398699634.. Please call me`,
      images: ["https://scontent.example/a1.jpg"],
      permalink: "https://www.facebook.com/groups/x/posts/1003",
      postCreatedAt: "2026-06-12T09:05:00Z",
      author: "Akhil Nenavath"
    }
  },
  {
    name: "4. WhatsApp — Aparna Zenon 3BHK ₹85k (LISTER w/ 'anyone looking' phrasing)",
    post: {
      text: `Contact Number:- 8096434212
Hey everyone! If you know anyone looking flat for rent, my friend's apartment is coming up for rent soon. Please feel free to pass this info along to your friends or colleagues!
Available for rent from june: a premium 3 BHK apartment in Aparna Zenon, a brand-new community with excellent connectivity.
Apartment Details:
Located on the 25th floor
Corner flat, East-facing
2257 sq ft spacious home ensuring large bedrooms and living areas
3 bedrooms + 3.5 bathrooms with geysers installed
5 air conditioners installed
Modular wardrobes in all bedrooms
Modular kitchen
Spacious balcony
Rent Details:
₹85,000 per month + maintenance
Please contact me for more details and site visit.
8096434212`,
      images: [],
      permalink: "",
      postCreatedAt: "",
      author: ""
    }
  },
  {
    name: "5. WhatsApp — Tolichowki 2BHK female flatmate ₹9k (LISTER)",
    post: {
      text: `Contact Number:- 9390859597
Female Flatmate Needed in a Cozy 2BHK at Tolichowki
Hi girls!
We're looking for a friendly and easygoing female flatmate to join our peaceful 2BHK setup. The room is available immediately, and temporary/short-term stays are also totally fine
Rent: ₹9,000/month
Deposit: ₹9,000
(You can recover the deposit from the replacement tenant when moving out)
About the Flat:
Spacious, comfortable, and well-maintained home
Calm and friendly environment
Electricity bill shared equally
Rented appliances available — charges split evenly
Suitable for working professionals or students
DM me for photos, exact location, and more details!
Contact details: 9390859597`,
      images: [],
      permalink: "",
      postCreatedAt: "",
      author: ""
    }
  },
  {
    name: "6. True FINDER post (control)",
    post: {
      text: `Hi everyone, I am looking for a 1BHK or 2BHK flat in Gachibowli or Madhapur under 25000. Working professional, can move in from July 1st. Please DM if you have anything available. Thanks!`,
      images: [],
      permalink: "https://www.facebook.com/groups/x/posts/1006",
      postCreatedAt: "2026-06-11T08:00:00Z",
      author: "Test Finder"
    }
  },
  {
    name: "7. Broker repost of #3 (same phone, same rent+locality — Scenario B/D)",
    post: {
      text: `Akhil rentals 9398699634 1bhk fully furnished flat available in kondapur Sri ram nagar colony rent 15000 ready to move. Call 9398699634`,
      images: [],
      permalink: "https://www.facebook.com/groups/y/posts/2001",
      postCreatedAt: "2026-06-10T12:00:00Z",
      author: "Akhil Nenavath"
    }
  },
  {
    name: "8. Same broker, DIFFERENT flat in Madhapur (Scenario C — must NOT merge)",
    post: {
      text: `Akhil rentals 9398699634 2bhk semi furnished flat available madhapur near hitec city rent 28000 family preferred. Call 9398699634`,
      images: [],
      permalink: "https://www.facebook.com/groups/y/posts/2002",
      postCreatedAt: "2026-06-11T12:00:00Z",
      author: "Akhil Nenavath"
    }
  }
];

if (typeof module !== "undefined") module.exports = FIXTURES;
