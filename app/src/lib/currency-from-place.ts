// Guess a sale's currency from its pickup text ("Indiranagar, Bengaluru" ->
// INR). The start-a-sale screen shows the guess with a "Change" link, so a
// miss costs one tap. Pure + tested.
//
// Whole-word match on lowercased text, so "India" hits but "Indiana" and
// "Indianapolis" don't. A 6-digit PIN code also means India (US ZIPs are 5).

import type { Currency } from "@/lib/money";

const INDIA_PLACES = [
  "india", "bharat",
  // States
  "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "goa",
  "gujarat", "haryana", "himachal pradesh", "jharkhand", "karnataka", "kerala",
  "madhya pradesh", "maharashtra", "manipur", "meghalaya", "mizoram", "nagaland",
  "odisha", "orissa", "punjab", "rajasthan", "sikkim", "tamil nadu", "telangana",
  "tripura", "uttar pradesh", "uttarakhand", "west bengal",
  // Union territories
  "andaman", "chandigarh", "dadra", "daman", "delhi", "jammu", "kashmir", "ladakh",
  "lakshadweep", "puducherry", "pondicherry", "ncr",
  // Cities, old and new names
  "mumbai", "bombay", "navi mumbai", "thane", "bengaluru", "bangalore", "chennai",
  "madras", "kolkata", "calcutta", "hyderabad", "secunderabad", "pune", "poona",
  "ahmedabad", "surat", "vadodara", "baroda", "jaipur", "lucknow", "kanpur",
  "nagpur", "indore", "bhopal", "patna", "ludhiana", "amritsar", "agra", "varanasi",
  "nashik", "kochi", "cochin", "thiruvananthapuram", "trivandrum", "kozhikode",
  "calicut", "thrissur", "coimbatore", "madurai", "mysuru", "mysore", "mangaluru",
  "mangalore", "visakhapatnam", "vizag", "vijayawada", "bhubaneswar", "guwahati",
  "dehradun", "shimla", "gurugram", "gurgaon", "noida", "ghaziabad", "faridabad",
  // Big-city neighborhoods sellers type on their own ("Neighborhood is enough")
  "indiranagar", "koramangala", "jayanagar", "hsr layout", "bandra", "andheri",
  "powai", "juhu", "colaba", "worli", "saket", "vasant kunj", "hauz khas", "dwarka",
  "gachibowli", "banjara hills", "jubilee hills", "adyar", "velachery",
];

const PIN_CODE = /\b[1-9]\d{5}\b/;

export function inferCurrency(place: string): Currency {
  if (PIN_CODE.test(place)) return "INR";
  const words = ` ${place.toLowerCase().replace(/[^a-z]+/g, " ").trim()} `;
  return INDIA_PLACES.some((p) => words.includes(` ${p} `)) ? "INR" : "USD";
}
