# NIRKATHA BD — Online Fashion Store

এটি NIRKATHA BD-এর জন্য একটি responsive clothing e-commerce starter application। Rokomari.com-এর মতো পরিচিত e-commerce flow থেকে অনুপ্রাণিত, তবে ডিজাইন ও ব্র্যান্ডিং সম্পূর্ণ NIRKATHA BD-এর নিজস্ব।

## অন্তর্ভুক্ত ফিচার
- Responsive fashion storefront, product search, category filter, price sorting
- Product catalogue এবং stock tracking
- Cart ও checkout; ঢাকা/ঢাকার বাইরের ডেলিভারি চার্জ
- Cash on Delivery এবং manual bKash/Nagad transaction ID collection
- Customer registration/login (bcrypt password hashing, HttpOnly JWT cookie)
- Customer order history API এবং wishlist API
- Admin login cookie, dashboard summary, product create/edit/hide, order status management
- Newsletter email collection
- SQLite database; Render Persistent Disk-এ রাখা যায়

## লোকাল রান
1. Node.js 20 বা নতুন সংস্করণ ইনস্টল করুন।
2. এই ফোল্ডারে Terminal/Command Prompt খুলুন।
3. `npm install`
4. `.env.example` কপি করে `.env` বানান।
5. `JWT_SECRET`-এ দীর্ঘ random secret এবং `ADMIN_PASSWORD`-এ শক্তিশালী পাসওয়ার্ড দিন।
6. `npm start`
7. ব্রাউজারে `http://localhost:3000` খুলুন। Admin: `http://localhost:3000/admin`

## Render deployment
- GitHub-এ এই ফোল্ডারের ফাইল upload করে Render-এ নতুন Web Service তৈরি করুন।
- Build Command: `npm install`
- Start Command: `npm start`
- Environment Variables: `NODE_ENV=production`, `JWT_SECRET`, `ADMIN_PASSWORD`, `DB_PATH=/var/data/store.db`, `BKASH_NUMBER`, `NAGAD_NUMBER`।
- Render Persistent Disk তৈরি করে mount path `/var/data` দিন। SQLite database টিকে থাকার জন্য এটি জরুরি।
- `nirkathabd.onrender.com` নামটি Render-এ পাওয়া গেলে service name হিসেবে `nirkathabd` দিন। সাবডোমেইন availability নিশ্চিত নয়।

## গুরুত্বপূর্ণ সীমাবদ্ধতা — লাইভ ব্যবসার আগে সম্পন্ন করতে হবে
এই build-টি কার্যকর starter/MVP; পূর্ণ production commerce platform নয়।
- bKash/Nagad-এর automatic payment gateway এখনো সংযুক্ত নয়; বর্তমানে manual payment instructions/transaction ID নেওয়া হয়। Merchant gateway credentials ও provider approval লাগবে।
- Password reset email/SMS, customer profile/address book UI, order tracking public page, review moderation, coupon engine, real image file upload, homepage banner CMS এখনো নেই।
- Product image admin-এ URL দিয়ে যোগ করা হয়।
- SQLite + persistent disk ছোট স্টোরের জন্য; বড় ট্রাফিক/একাধিক সার্ভার হলে managed PostgreSQL-এ migrate করতে হবে।
- Admin password login-এ rate limiting, CSRF protection, audit log, backup policy এবং HTTPS/production security review যোগ করতে হবে।
- Delivery fee এখন placeholder: Dhaka ৳60, outside Dhaka ৳120। আপনার courier rate অনুযায়ী বদলাতে হবে।

কোনো বাস্তব payment credential বা ব্যক্তিগত পাসওয়ার্ড ZIP ফাইলে রাখবেন না।
