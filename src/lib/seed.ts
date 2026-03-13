
import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

// --- IMPORTANT ---
// To get a service account key:
// 1. Go to your Firebase project console.
// 2. Click the gear icon > Project settings > Service accounts.
// 3. Click "Generate new private key". A JSON file will be downloaded.
// 4. Copy the contents of that file and paste it into a new file named 'service-account.json' in the root of this project.
// 5. Make sure 'service-account.json' is added to your .gitignore file to keep it out of source control.

const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'service-account.json');

function getAdminApp(): App {
  if (getApps().length) {
    return getApps()[0];
  }
  
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new Error(`
      Service account key not found at: ${SERVICE_ACCOUNT_PATH}
      Please follow the instructions in the src/lib/seed.ts file to create one.
    `);
  }
  
  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

async function seedCollection(
  db: Firestore,
  collectionName: 'categories' | 'storeLists' | 'boosters',
  filePath: string,
  idPrefix: string,
  idFields: string[]
) {
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping collection '${collectionName}': file not found at ${filePath}`);
    return 0;
  }

  const fileContent = fs.readFileSync(filePath, 'utf8');
  const { data } = Papa.parse(fileContent, { header: true, skipEmptyLines: true });

  if (data.length === 0) {
    console.log(`Skipping collection '${collectionName}': no data in file.`);
    return 0;
  }

  console.log(`Starting to seed '${collectionName}' collection with ${data.length} records...`);

  const collectionRef = db.collection(collectionName);
  const batchSize = 100;
  let processedCount = 0;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = db.batch();
    const batchData = data.slice(i, i + batchSize);

    batchData.forEach((item: any) => {
      let docId = item.id ? String(item.id).trim() : '';

      if (!docId) {
        const idParts = idFields.map(field => String(item[field] || '').replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean);
        if (idParts.length > 0) {
            docId = `${idPrefix}-${idParts.join('-')}-${Math.random().toString(36).substring(2, 7)}`;
        } else {
            // Fallback if all ID fields are empty
            docId = `${idPrefix}-${Math.random().toString(36).substring(2, 11)}`;
        }
      }
      
      const docRef = collectionRef.doc(docId);
      
      const cleanItem: any = { id: docId };
      Object.keys(item).forEach(key => {
        const value = item[key];
        const trimmedKey = key.trim();
        
        // Convert specific fields to numbers or booleans
        if (['Weekly Quota', 'Monthly Quota'].includes(trimmedKey)) {
          cleanItem[trimmedKey.replace(/\s+/g, '')] = parseInt(value, 10) || 0;
        } else if (trimmedKey === 'Premium') {
          cleanItem[trimmedKey.toLowerCase()] = ['yes', 'true', '1'].includes(String(value).toLowerCase());
        } else {
          // Clean up key for Firestore
          const firestoreKey = trimmedKey
            .replace(/\s+/g, '') // remove spaces
            .replace(/-([a-z])/g, g => g[1].toUpperCase()); // camelCase
            
          cleanItem[firestoreKey] = value;
        }
      });
      
      // Rename to match schema
      const finalDoc: any = {};
      if (collectionName === 'categories') {
        finalDoc.id = cleanItem.id;
        finalDoc.department = cleanItem.Department || '';
        finalDoc.subDepartment = cleanItem.SubDepartment || '';
        finalDoc.name = cleanItem.Category || '';
        finalDoc.number = String(cleanItem.CategoryCode || '');
        finalDoc.exampleBrands = cleanItem.ExampleBrands || '';
        finalDoc.description = cleanItem.Description || '';
        finalDoc.country = cleanItem.Country || '';
        finalDoc.premium = cleanItem.premium || false;
        finalDoc.notes = cleanItem.Notes || '';
      } else if (collectionName === 'storeLists') {
        finalDoc.id = cleanItem.id;
        finalDoc.name = cleanItem.Name || '';
        finalDoc.retailer = cleanItem.Retailer || '';
        finalDoc.country = cleanItem.Country || '';
        finalDoc.weeklyQuota = cleanItem.weeklyQuota || 0;
        finalDoc.monthlyQuota = cleanItem.monthlyQuota || 0;
      } else if (collectionName === 'boosters') {
        finalDoc.id = cleanItem.id;
        finalDoc.name = cleanItem.Name || '';
        finalDoc.country = cleanItem.Country || '';
      }

      batch.set(docRef, finalDoc, { merge: true });
    });

    await batch.commit();
    processedCount += batchData.length;
    console.log(`  ... processed ${processedCount}/${data.length} records for '${collectionName}'`);
  }

  console.log(`✅ Successfully seeded ${processedCount} records into '${collectionName}'.`);
  return processedCount;
}

async function seedDatabase() {
  try {
    console.log('Initializing Firebase Admin...');
    const app = getAdminApp();
    const db = getFirestore(app);
    console.log('Firebase Admin Initialized.');

    const categoriesPath = path.join(process.cwd(), 'src', 'lib', 'data', 'categories.csv');
    const storeListsPath = path.join(process.cwd(), 'src', 'lib', 'data', 'store-lists.csv');
    const boostersPath = path.join(process.cwd(), 'src', 'lib', 'data', 'boosters.csv');
    
    await seedCollection(db, 'categories', categoriesPath, 'cat', ['Country', 'Category Code']);
    await seedCollection(db, 'storeLists', storeListsPath, 'sl', ['Name', 'Retailer']);
    await seedCollection(db, 'boosters', boostersPath, 'bst', ['Name', 'Country']);

    console.log('\nDatabase seeding complete! ✨');

  } catch (error) {
    console.error('\n❌ Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();
