import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCjjiqQKprkyzcX3wIHlCupb7xggrpYrrk",
  authDomain: "molkky-dome.firebaseapp.com",
  databaseURL: "https://molkky-dome-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "molkky-dome",
  storageBucket: "molkky-dome.firebasestorage.app",
  messagingSenderId: "717634414093",
  appId: "1:717634414093:web:81b0a708687e39bc6dd744",
  measurementId: "G-C19E29TMMD"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
