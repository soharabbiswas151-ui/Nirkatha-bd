const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const dbPath = process.env.DB_PATH || path.join(__dirname, 'store.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
app.disable('x-powered-by');
app.use(express.json({limit:'1mb'}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname,'public')));
app.use('/api/auth', rateLimit({windowMs:15*60*1000, max:30, standardHeaders:true, legacyHeaders:false}));

// Core store tables. SQLite is suitable for a small launch when Render Persistent Disk is attached.
db.exec(`
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT DEFAULT 'T-Shirt',
 price INTEGER NOT NULL, compare_price INTEGER DEFAULT 0, description TEXT DEFAULT '', image TEXT DEFAULT '',
 gallery TEXT DEFAULT '[]', sizes TEXT DEFAULT 'S,M,L,XL,2XL', colors TEXT DEFAULT 'Black,White',
 stock INTEGER DEFAULT 10, active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS customers (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
 phone TEXT DEFAULT '', password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS wishlist (
 customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 product_id INTEGER NOT NULL REFERENCES products(id), PRIMARY KEY(customer_id,product_id)
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER REFERENCES customers(id), customer_name TEXT NOT NULL,
 phone TEXT NOT NULL, address TEXT NOT NULL, area TEXT NOT NULL, payment_method TEXT NOT NULL,
 transaction_id TEXT DEFAULT '', subtotal INTEGER NOT NULL, delivery INTEGER NOT NULL, total INTEGER NOT NULL,
 items TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, status TEXT DEFAULT 'Pending'
);
CREATE TABLE IF NOT EXISTS subscribers (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);

// Lightweight migration for databases created by the earlier starter version.
const cols = db.prepare('PRAGMA table_info(products)').all().map(x=>x.name);
for (const [name,sql] of [['compare_price','ALTER TABLE products ADD COLUMN compare_price INTEGER DEFAULT 0'],['gallery',"ALTER TABLE products ADD COLUMN gallery TEXT DEFAULT '[]'"],['colors',"ALTER TABLE products ADD COLUMN colors TEXT DEFAULT 'Black,White'"],['created_at',"ALTER TABLE products ADD COLUMN created_at TEXT"]]) if(!cols.includes(name)) db.exec(sql);
const orderCols=db.prepare('PRAGMA table_info(orders)').all().map(x=>x.name);
if(!orderCols.includes('customer_id')) db.exec('ALTER TABLE orders ADD COLUMN customer_id INTEGER');

if (!db.prepare('SELECT COUNT(*) n FROM products').get().n) {
 const insert=db.prepare('INSERT INTO products(name,category,price,compare_price,description,image,sizes,colors,stock) VALUES(?,?,?,?,?,?,?,?,?)');
 [
 ['NIRKATHA — Mountain State','Graphic T-Shirt',890,1090,'A clean graphic inspired by mountains, sun and open skies.','https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=900','S,M,L,XL,2XL','Black,White,Stone',20],
 ['NIRKATHA — Essential Black','Essential T-Shirt',750,0,'Everyday comfort with a minimal NIRKATHA signature.','https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=900','S,M,L,XL,2XL','Black',25],
 ['NIRKATHA — Nature Lines','Graphic T-Shirt',890,0,'Nature-led artwork with a relaxed everyday fit.','https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=900','S,M,L,XL,2XL','Black,White',15],
 ['NIRKATHA — Core Hoodie','Hoodie',1490,1690,'A clean everyday layer with a premium streetwear feel.','https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=900','M,L,XL,2XL','Black,Charcoal',12]
 ].forEach(p=>insert.run(...p));
}

const secret=process.env.JWT_SECRET || 'CHANGE_THIS_LONG_RANDOM_SECRET_BEFORE_DEPLOYMENT';
const sign=(payload)=>jwt.sign(payload,secret,{expiresIn:'7d'});
const setAuthCookie=(res,token)=>res.cookie('nirkatha_token',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:7*24*60*60*1000});
function getUser(req){try{return jwt.verify(req.cookies.nirkatha_token,secret)}catch{return null}}
function customer(req,res,next){const u=getUser(req);if(!u||u.role!=='customer')return res.status(401).json({error:'অনুগ্রহ করে লগইন করুন।'});req.user=u;next()}
function admin(req,res,next){const u=getUser(req);if(u&&u.role==='admin'){req.user=u;return next()}return res.status(401).json({error:'Admin login required'});}
const deliveryFee=area=>area==='inside'?60:120;
const safeProduct=p=>({...p,gallery:JSON.parse(p.gallery||'[]'),sizes:(p.sizes||'').split(',').filter(Boolean),colors:(p.colors||'').split(',').filter(Boolean)});

app.get('/api/config',(req,res)=>res.json({storeName:'NIRKATHA BD',tagline:'WEAR • FEEL • BE YOU',payments:{bKash:process.env.BKASH_NUMBER||'',Nagad:process.env.NAGAD_NUMBER||''}}));
app.get('/api/products',(req,res)=>res.json(db.prepare('SELECT * FROM products WHERE active=1 ORDER BY id DESC').all().map(safeProduct)));
app.get('/api/products/:id',(req,res)=>{const p=db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(req.params.id);if(!p)return res.status(404).json({error:'Product not found'});res.json(safeProduct(p));});

// Customer accounts: passwords are bcrypt-hashed; auth token is stored in an HttpOnly cookie.
app.post('/api/auth/register',async(req,res)=>{
 const {name,email,phone='',password}=req.body||{};
 if(!name||!email||!/^\S+@\S+\.\S+$/.test(email)||!password||String(password).length<8)return res.status(400).json({error:'নাম, সঠিক ইমেইল এবং কমপক্ষে ৮ অক্ষরের পাসওয়ার্ড দিন।'});
 try{const hash=await bcrypt.hash(password,12);const r=db.prepare('INSERT INTO customers(name,email,phone,password_hash) VALUES(?,?,?,?)').run(name.trim(),email.toLowerCase().trim(),phone,hash);const user={id:r.lastInsertRowid,name,email:email.toLowerCase().trim(),role:'customer'};setAuthCookie(res,sign(user));res.json({ok:true,user});}catch(e){if(String(e).includes('UNIQUE'))return res.status(409).json({error:'এই ইমেইলে অ্যাকাউন্ট আছে।'});res.status(500).json({error:'অ্যাকাউন্ট তৈরি করা যায়নি।'});}
});
app.post('/api/auth/login',async(req,res)=>{const {email,password}=req.body||{};const u=db.prepare('SELECT * FROM customers WHERE email=?').get(String(email||'').toLowerCase().trim());if(!u||!await bcrypt.compare(String(password||''),u.password_hash))return res.status(401).json({error:'ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।'});const user={id:u.id,name:u.name,email:u.email,role:'customer'};setAuthCookie(res,sign(user));res.json({ok:true,user});});
app.get('/api/auth/me',(req,res)=>{const u=getUser(req);if(!u)return res.json({user:null});if(u.role==='customer'){const c=db.prepare('SELECT id,name,email,phone FROM customers WHERE id=?').get(u.id);return res.json({user:c?{...c,role:'customer'}:null});}res.json({user:{role:u.role}});});
app.post('/api/auth/logout',(req,res)=>{res.clearCookie('nirkatha_token');res.json({ok:true});});
app.get('/api/account/orders',customer,(req,res)=>res.json(db.prepare('SELECT * FROM orders WHERE customer_id=? ORDER BY id DESC').all(req.user.id).map(o=>({...o,items:JSON.parse(o.items)}))));
app.get('/api/wishlist',customer,(req,res)=>res.json(db.prepare('SELECT p.* FROM wishlist w JOIN products p ON p.id=w.product_id WHERE w.customer_id=? AND p.active=1').all(req.user.id).map(safeProduct)));
app.post('/api/wishlist/:id',customer,(req,res)=>{try{db.prepare('INSERT INTO wishlist(customer_id,product_id) VALUES(?,?)').run(req.user.id,req.params.id);res.json({ok:true});}catch{db.prepare('DELETE FROM wishlist WHERE customer_id=? AND product_id=?').run(req.user.id,req.params.id);res.json({ok:true,removed:true});}});

app.post('/api/orders',(req,res)=>{
 const {customer_name,phone,address,area,payment_method,transaction_id='',items=[]}=req.body||{};
 if(!customer_name||!phone||!address||!['inside','outside'].includes(area)||!payment_method||!Array.isArray(items)||!items.length)return res.status(400).json({error:'সব তথ্য পূরণ করুন।'});
 const normalized=[];let subtotal=0;
 for(const item of items){const p=db.prepare('SELECT id,name,price,stock FROM products WHERE id=? AND active=1').get(Number(item.id));const qty=Math.max(1,Math.min(10,Number(item.qty)||1));if(!p||p.stock<qty)return res.status(400).json({error:`${p?.name||'একটি পণ্য'} বর্তমানে পর্যাপ্ত স্টকে নেই।`});subtotal+=p.price*qty;normalized.push({id:p.id,name:p.name,price:p.price,qty,size:item.size||'',color:item.color||''});}
 const delivery=deliveryFee(area),total=subtotal+delivery;
 const save=db.transaction(()=>{const info=db.prepare('INSERT INTO orders(customer_id,customer_name,phone,address,area,payment_method,transaction_id,subtotal,delivery,total,items) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(getUser(req)?.id||null,customer_name,phone,address,area,payment_method,transaction_id,subtotal,delivery,total,JSON.stringify(normalized));for(const it of normalized){const r=db.prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?').run(it.qty,it.id,it.qty);if(!r.changes)throw new Error('স্টক পরিবর্তিত হয়েছে। আবার চেষ্টা করুন।');}return info.lastInsertRowid;});
 try{const order_id=save();res.json({ok:true,order_id,total,delivery});}catch(e){res.status(409).json({error:e.message||'অর্ডার নেওয়া যায়নি।'});}
});
app.post('/api/newsletter',(req,res)=>{const email=String(req.body.email||'').trim().toLowerCase();if(!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:'সঠিক ইমেইল দিন।'});try{db.prepare('INSERT INTO subscribers(email) VALUES(?)').run(email);}catch{}res.json({ok:true});});

// Admin authentication is separate from customer authentication.
app.post('/api/admin/login',(req,res)=>{if(!process.env.ADMIN_PASSWORD)return res.status(503).json({error:'ADMIN_PASSWORD environment variable সেট করা হয়নি।'});if(req.body.password!==process.env.ADMIN_PASSWORD)return res.status(401).json({error:'পাসওয়ার্ড সঠিক নয়।'});setAuthCookie(res,sign({role:'admin'}));res.json({ok:true});});
app.post('/api/admin/logout',(req,res)=>{res.clearCookie('nirkatha_token');res.json({ok:true});});
app.get('/api/admin/summary',admin,(req,res)=>{const orders=db.prepare('SELECT COUNT(*) n FROM orders').get().n;const products=db.prepare('SELECT COUNT(*) n FROM products WHERE active=1').get().n;const pending=db.prepare("SELECT COUNT(*) n FROM orders WHERE status IN ('Pending','Confirmed','Processing')").get().n;const revenue=db.prepare("SELECT COALESCE(SUM(total),0) n FROM orders WHERE status='Delivered'").get().n;const customers=db.prepare('SELECT COUNT(*) n FROM customers').get().n;res.json({orders,products,pending,revenue,customers});});
app.get('/api/admin/orders',admin,(req,res)=>res.json(db.prepare('SELECT * FROM orders ORDER BY id DESC').all().map(o=>({...o,items:JSON.parse(o.items)}))));
app.patch('/api/admin/orders/:id',admin,(req,res)=>{const allowed=['Pending','Confirmed','Processing','Shipped','Delivered','Cancelled','Returned'];if(!allowed.includes(req.body.status))return res.status(400).json({error:'Invalid status'});const r=db.prepare('UPDATE orders SET status=? WHERE id=?').run(req.body.status,req.params.id);res.json({ok:r.changes>0});});
app.get('/api/admin/customers',admin,(req,res)=>res.json(db.prepare('SELECT id,name,email,phone,created_at FROM customers ORDER BY id DESC').all()));
app.get('/api/admin/subscribers',admin,(req,res)=>res.json(db.prepare('SELECT * FROM subscribers ORDER BY id DESC').all()));
app.post('/api/admin/products',admin,(req,res)=>{const {name,category='T-Shirt',price,compare_price=0,description='',image='',gallery=[],sizes='S,M,L,XL,2XL',colors='Black,White',stock=0}=req.body;if(!name||!Number.isFinite(Number(price))||Number(price)<1)return res.status(400).json({error:'Name and valid price required'});const r=db.prepare('INSERT INTO products(name,category,price,compare_price,description,image,gallery,sizes,colors,stock) VALUES(?,?,?,?,?,?,?,?,?,?)').run(name,category,price,compare_price,description,image,JSON.stringify(Array.isArray(gallery)?gallery:[]),Array.isArray(sizes)?sizes.join(','):sizes,Array.isArray(colors)?colors.join(','):colors,Math.max(0,Number(stock)||0));res.json({ok:true,id:r.lastInsertRowid});});
app.patch('/api/admin/products/:id',admin,(req,res)=>{const p=db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);if(!p)return res.status(404).json({error:'Product not found'});const b={...p,...req.body};db.prepare('UPDATE products SET name=?,category=?,price=?,compare_price=?,description=?,image=?,gallery=?,sizes=?,colors=?,stock=?,active=? WHERE id=?').run(b.name,b.category,Number(b.price),Number(b.compare_price)||0,b.description,b.image,JSON.stringify(Array.isArray(b.gallery)?b.gallery:JSON.parse(b.gallery||'[]')),Array.isArray(b.sizes)?b.sizes.join(','):b.sizes,Array.isArray(b.colors)?b.colors.join(','):b.colors,Math.max(0,Number(b.stock)||0),b.active===false?0:1,req.params.id);res.json({ok:true});});
app.delete('/api/admin/products/:id',admin,(req,res)=>{db.prepare('UPDATE products SET active=0 WHERE id=?').run(req.params.id);res.json({ok:true});});
app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
const port=process.env.PORT||3000;app.listen(port,()=>console.log(`NIRKATHA BD store running on port ${port}`));
