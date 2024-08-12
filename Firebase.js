class Firestore {
  constructor(db) {
    if (!db) {
      throw new Error("IndexedDB is not initialized.");
    }
    this.db = db;
  }

  // Collection operations
  collection(collectionPath) {
    return new CollectionReference(this.db, collectionPath);
  }

  // Document operations
  doc(documentPath) {
    const [collectionPath, docId] = documentPath.split("/");
    return new DocumentReference(this.db, collectionPath, docId);
  }
  // List all collections in the Firestore database
  async listCollections() {
    const transaction = this.db.transaction(["documents"], "readonly");
    const store = transaction.objectStore("documents");

    return new Promise((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
        const collections = new Set(
          request.result.map((doc) => doc.collectionPath.split("/")[0])
        );
        resolve(
          [...collections].map(
            (collection) => new CollectionReference(this.db, collection)
          )
        );
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  async runTransaction(updateFunction) {
    const transaction = this.db.transaction(["documents"], "readwrite");
    const store = transaction.objectStore("documents");

    const transactionAPI = {
      async get(docRef) {
        return new Promise((resolve, reject) => {
          const request = store.get(docRef.docId);
          request.onsuccess = () => {
            const result = request.result;
            if (result && result.collectionPath === docRef.collectionPath) {
              resolve(new DocumentSnapshot(result));
            } else {
              resolve({ exists: () => false, data: () => null });
            }
          };
          request.onerror = (event) => reject(event.target.error);
        });
      },

      async set(docRef, data) {
        const docData = {
          id: docRef.docId,
          collectionPath: docRef.collectionPath,
          ...data,
        };
        return new Promise((resolve, reject) => {
          const request = store.put(docData);
          request.onsuccess = () => resolve();
          request.onerror = (event) => reject(event.target.error);
        });
      },

      async update(docRef, data) {
        const docSnapshot = await this.get(docRef);
        if (!docSnapshot.exists()) {
          throw new Error("Document does not exist");
        }
        const updatedData = { ...docSnapshot.data(), ...data };
        return new Promise((resolve, reject) => {
          const request = store.put(updatedData);
          request.onsuccess = () => resolve();
          request.onerror = (event) => reject(event.target.error);
        });
      },

      async delete(docRef) {
        return new Promise((resolve, reject) => {
          const request = store.delete(docRef.docId);
          request.onsuccess = () => resolve();
          request.onerror = (event) => reject(event.target.error);
        });
      },
    };

    return new Promise(async (resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = (event) => reject(event.target.error);
      transaction.onabort = () => reject(new Error("Transaction aborted"));

      try {
        await updateFunction(transactionAPI);
        if (transaction.error) {
          reject(transaction.error);
        }
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  }
  // Batch operations
  batch() {
    return new WriteBatch(this.db);
  }

  // Get a document
  async get(docId) {
    const transaction = this.db.transaction(["documents"], "readonly");
    const store = transaction.objectStore("documents");
    const request = store.get(docId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // Set a document
  async set(data, options) {
    const transaction = this.db.transaction(["documents"], "readwrite");
    const store = transaction.objectStore("documents");
    const request = store.put(data);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve();
      };
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // Update a document
  async update(docId, data) {
    const transaction = this.db.transaction(["documents"], "readwrite");
    const store = transaction.objectStore("documents");
    const request = store.get(docId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const existingData = request.result;
        const updatedData = { ...existingData, ...data };
        const updateRequest = store.put(updatedData);

        updateRequest.onsuccess = () => {
          resolve();
        };
        updateRequest.onerror = (event) => {
          reject(event.target.error);
        };
      };
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // Delete a document
  async delete(docId) {
    const transaction = this.db.transaction(["documents"], "readwrite");
    const store = transaction.objectStore("documents");
    const request = store.delete(docId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve();
      };
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }
}

class Firebase {
  constructor(config) {
    this.dbName = config.dbName || "FirebaseDB";
    this.dbVersion = config.dbVersion || 1;
    this.db = null;
  }

  // Static method to initialize the Firebase app
  static initializeApp(config) {
    return new Firebase(config);
  }

  // Initialize IndexedDB
  initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        this.db = event.target.result;

        // Create stores for collections
        if (!this.db.objectStoreNames.contains("documents")) {
          const objectStore = this.db.createObjectStore("documents", {
            keyPath: "id",
            autoIncrement: true,
          });

          // Create an index for collectionPath
          objectStore.createIndex("collectionPath", "collectionPath", {
            unique: false,
          });

          console.log("Index 'collectionPath' created successfully.");
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log("IndexedDB initialized successfully");
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error("IndexedDB initialization failed", event);
        reject(event);
      };
    });
  }

  // Simulate Firestore initialization
  async firestore() {
    if (!this.db) {
      await this.initDB();
    }
    return new Firestore(this.db); // Ensure it returns a Firestore instance
  }
}

class DocumentReference {
  constructor(db, collectionPath, docId) {
    this.db = db;
    this.collectionPath = collectionPath;
    this.docId = docId;
  }

  get id() {
    return this.docId;
  }

  get path() {
    return `${this.collectionPath}/${this.docId}`;
  }

  // Set data for the document
  async set(data, options = {}) {
    const transaction = this.db.transaction(["documents"], "readwrite");
    const store = transaction.objectStore("documents");
    const docData = {
      id: this.docId,
      collectionPath: this.collectionPath,
      ...data,
    };

    const request = store.put(docData);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve();
      };
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // Update data for the document
  async update(data) {
    const transaction = this.db.transaction(["documents"], "readwrite");
    const store = transaction.objectStore("documents");
    const request = store.get(this.docId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const existingData = request.result;
        if (
          !existingData ||
          existingData.collectionPath !== this.collectionPath
        ) {
          reject(new Error("Document does not exist"));
          return;
        }
        const updatedData = { ...existingData, ...data };
        const updateRequest = store.put(updatedData);

        updateRequest.onsuccess = () => {
          resolve();
        };
        updateRequest.onerror = (event) => {
          reject(event.target.error);
        };
      };
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // Get the document
  async get() {
    const transaction = this.db.transaction(["documents"], "readonly");
    const store = transaction.objectStore("documents");
    const request = store.get(this.docId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const doc = request.result;
        if (doc && doc.collectionPath === this.collectionPath) {
          resolve(new DocumentSnapshot(doc));
        } else {
          resolve({ exists: false, data: () => null });
        }
      };
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // Delete the document
  async delete() {
    const transaction = this.db.transaction(["documents"], "readwrite");
    const store = transaction.objectStore("documents");
    const request = store.delete(this.docId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve();
      };
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // Get a reference to a subcollection
  collection(subcollectionPath) {
    return new CollectionReference(
      this.db,
      `${this.collectionPath}/${this.docId}/${subcollectionPath}`
    );
  }
}

class Query {
  constructor(db, collectionPath) {
    this.db = db;
    this.collectionPath = collectionPath;
    this.queryConstraints = [];
  }

  // Add a where clause to the query
  where(field, operator, value) {
    this.queryConstraints.push({ type: "where", field, operator, value });
    return this;
  }

  // Add an orderBy clause to the query
  orderBy(field, direction = "asc") {
    this.queryConstraints.push({ type: "orderBy", field, direction });
    return this;
  }

  // Limit the number of documents returned
  limit(number) {
    this.queryConstraints.push({ type: "limit", number });
    return this;
  }

  // Start the query at a specific snapshot or field value
  startAt(snapshotOrFieldValue) {
    this.queryConstraints.push({
      type: "startAt",
      value: snapshotOrFieldValue,
    });
    return this;
  }

  // Start the query after a specific snapshot or field value
  startAfter(snapshotOrFieldValue) {
    this.queryConstraints.push({
      type: "startAfter",
      value: snapshotOrFieldValue,
    });
    return this;
  }

  // End the query at a specific snapshot or field value
  endAt(snapshotOrFieldValue) {
    this.queryConstraints.push({ type: "endAt", value: snapshotOrFieldValue });
    return this;
  }

  // End the query before a specific snapshot or field value
  endBefore(snapshotOrFieldValue) {
    this.queryConstraints.push({
      type: "endBefore",
      value: snapshotOrFieldValue,
    });
    return this;
  }

  // Execute the query and return the results
  async get() {
    const transaction = this.db.transaction(["documents"], "readonly");
    const store = transaction.objectStore("documents");
    const index = store.index("collectionPath");

    return new Promise((resolve, reject) => {
      const request = index.getAll(IDBKeyRange.only(this.collectionPath));

      request.onsuccess = () => {
        let results = request.result;

        // Apply where filters
        this.queryConstraints.forEach((constraint) => {
          if (constraint.type === "where") {
            results = results.filter((doc) => {
              const fieldValue = doc[constraint.field];
              switch (constraint.operator) {
                case "==":
                  return fieldValue === constraint.value;
                case "!=":
                  return fieldValue !== constraint.value;
                case ">":
                  return fieldValue > constraint.value;
                case "<":
                  return fieldValue < constraint.value;
                case ">=":
                  return fieldValue >= constraint.value;
                case "<=":
                  return fieldValue <= constraint.value;
                case "array-contains":
                  return (
                    Array.isArray(fieldValue) &&
                    fieldValue.includes(constraint.value)
                  );
                default:
                  return false;
              }
            });
          }
        });

        // Apply orderBy
        const orderByConstraint = this.queryConstraints.find(
          (constraint) => constraint.type === "orderBy"
        );
        if (orderByConstraint) {
          results.sort((a, b) => {
            const fieldA = a[orderByConstraint.field];
            const fieldB = b[orderByConstraint.field];
            if (orderByConstraint.direction === "asc") {
              return fieldA < fieldB ? -1 : fieldA > fieldB ? 1 : 0;
            } else {
              return fieldA > fieldB ? -1 : fieldA < fieldB ? 1 : 0;
            }
          });
        }

        // Apply limit
        const limitConstraint = this.queryConstraints.find(
          (constraint) => constraint.type === "limit"
        );
        if (limitConstraint) {
          results = results.slice(0, limitConstraint.number);
        }

        resolve(results.map((doc) => new DocumentSnapshot(doc)));
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // Listen to real-time updates using polling
  onSnapshot(callback) {
    const poll = async () => {
      const snapshot = await this.get();
      if (JSON.stringify(snapshot) !== JSON.stringify(this._lastSnapshot)) {
        this._lastSnapshot = snapshot;
        callback(snapshot);
      }
    };

    // Start polling every 100ms
    this._pollingInterval = setInterval(poll, 100);

    // Return an unsubscribe function
    return () => {
      clearInterval(this._pollingInterval);
    };
  }
}

class CollectionReference extends Query {
  constructor(db, collectionPath) {
    super(db, collectionPath); // Initialize as a query on this collection
  }

  // Add a document to the collection
  async add(data) {
    const transaction = this.db.transaction(["documents"], "readwrite");
    const store = transaction.objectStore("documents");
    const docId = this._generateId();
    const docData = { id: docId, collectionPath: this.collectionPath, ...data };

    const request = store.add(docData);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(new DocumentReference(this.db, this.collectionPath, docId));
      };
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // Get a document reference by ID
  doc(documentId) {
    return new DocumentReference(this.db, this.collectionPath, documentId);
  }

  // Get all documents in the collection
  async get() {
    const transaction = this.db.transaction(["documents"], "readonly");
    const store = transaction.objectStore("documents");

    try {
      const index = store.index("collectionPath"); // Log an attempt to use the index
      console.log("Using 'collectionPath' index to fetch documents.");

      const request = index.getAll(IDBKeyRange.only(this.collectionPath));

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const docs = request.result.map((doc) => new DocumentSnapshot(doc));
          resolve(docs);
        };
        request.onerror = (event) => {
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error("Failed to access the 'collectionPath' index:", error);
      throw error;
    }
  }

  // Get a reference to a subcollection
  collection(subcollectionPath) {
    return new CollectionReference(
      this.db,
      `${this.collectionPath}/${subcollectionPath}`
    );
  }

  // Generate a random document ID
  _generateId() {
    return "_" + Math.random().toString(36).substr(2, 9);
  }
}

class WriteBatch {
  constructor(db) {
    this.db = db;
    this.operations = [];
  }

  // Set a document in the batch
  set(documentRef, data, options = {}) {
    this.operations.push({ type: "set", documentRef, data, options });
    return this;
  }

  // Update a document in the batch
  update(documentRef, data) {
    this.operations.push({ type: "update", documentRef, data });
    return this;
  }

  // Delete a document in the batch
  delete(documentRef) {
    this.operations.push({ type: "delete", documentRef });
    return this;
  }

  // Commit the batch operations
  async commit() {
    const transaction = this.db.transaction(["documents"], "readwrite");
    const store = transaction.objectStore("documents");

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = (event) => {
        reject(event.target.error);
      };

      this.operations.forEach((operation) => {
        const { type, documentRef, data } = operation;

        switch (type) {
          case "set":
            store.put({
              id: documentRef.docId,
              collectionPath: documentRef.collectionPath,
              ...data,
            });
            break;

          case "update":
            const getRequest = store.get(documentRef.docId);
            getRequest.onsuccess = () => {
              const existingData = getRequest.result;
              if (
                existingData &&
                existingData.collectionPath === documentRef.collectionPath
              ) {
                const updatedData = { ...existingData, ...data };
                store.put(updatedData);
              } else {
                reject(new Error("Document does not exist for update"));
              }
            };
            getRequest.onerror = (event) => {
              reject(event.target.error);
            };
            break;

          case "delete":
            store.delete(documentRef.docId);
            break;

          default:
            reject(new Error("Unknown operation type"));
        }
      });
    });
  }
}

class DocumentSnapshot {
  constructor(doc) {
    this._doc = doc;
    this._exists = !!doc;
    this._metadata = {
      fromCache: true, // IndexedDB is a local cache, so we simulate this.
      hasPendingWrites: false, // This can be extended to simulate pending writes.
    };
  }

  // Check if the document exists
  exists() {
    return this._exists;
  }

  // Get all document data
  data() {
    return this._doc || null;
  }

  // Get a specific field or nested field using a dot-separated field path
  get(fieldPath) {
    if (!this._exists) {
      return undefined;
    }

    const fields = fieldPath.split(".");
    let value = this._doc;

    for (const field of fields) {
      if (value && typeof value === "object" && field in value) {
        value = value[field];
      } else {
        return undefined;
      }
    }

    return value;
  }

  // Get the document ID
  get id() {
    return this._doc.id;
  }

  // Simulate metadata retrieval
  get metadata() {
    return this._metadata;
  }

  // For convenience, simulate Firestore's isEqual method
  isEqual(other) {
    return (
      other instanceof DocumentSnapshot &&
      this.id === other.id &&
      JSON.stringify(this._doc) === JSON.stringify(other.data())
    );
  }
}

(async function testFirestoreSimulation() {
  // Initialize Firebase app with a configuration
  const config = {
    dbName: "TestDB",
    dbVersion: 1,
  };
  const firebaseApp = Firebase.initializeApp(config);
  const firestore = await firebaseApp.firestore(); // Await the firestore initialization

  // Wait for IndexedDB to initialize
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Collection reference example
  const usersCollection = firestore.collection("users");

  // Adding documents to the collection
  const user1Ref = await usersCollection.add({ name: "Alice", age: 25 });
  const user2Ref = await usersCollection.add({ name: "Bob", age: 30 });
  const user3Ref = await usersCollection.add({ name: "Charlie", age: 35 });

  console.log("Added Users:");
  console.log("User 1:", (await user1Ref.get()).data());
  console.log("User 2:", (await user2Ref.get()).data());
  console.log("User 3:", (await user3Ref.get()).data());

  // Updating a document
  await user1Ref.update({ age: 26 });
  console.log("Updated User 1:", (await user1Ref.get()).data());

  // Getting a single document directly by its reference
  const singleUser = await firestore.doc("users/" + user2Ref.docId).get();
  console.log("Single User:", singleUser.data());

  // Querying the collection
  const query = usersCollection
    .where("age", ">", 25)
    .orderBy("age", "asc")
    .limit(2);
  const querySnapshot = await query.get();
  console.log("Query Results (age > 25):");
  querySnapshot.forEach((doc) => {
    console.log(doc.data());
  });

  // Running a batch operation
  const batch = firestore.batch();
  batch.set(usersCollection.doc("user4"), { name: "David", age: 28 });
  batch.update(user2Ref, { age: 31 });
  batch.delete(user3Ref);
  await batch.commit();

  console.log("After Batch Operations:");
  console.log("User 2 (updated):", (await user2Ref.get()).data());
  try {
    const deletedUser = await user3Ref.get();
    console.log(
      "User 3 (deleted):",
      deletedUser.exists() ? deletedUser.data() : "Document does not exist"
    );
  } catch (error) {
    console.log("User 3 was successfully deleted");
  }
  console.log(
    "User 4 (new):",
    (await usersCollection.doc("user4").get()).data()
  );

  await firestore.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(user1Ref);
    const newAge = userDoc.data().age + 1;
    transaction.update(user1Ref, { age: newAge });
  });

  console.log("User 1 after transaction:", (await user1Ref.get()).data());
  // Testing real-time updates using onSnapshot with polling
  const unsubscribe = query.onSnapshot((snapshot) => {
    console.log("Real-time snapshot update:");
    snapshot.forEach((doc) => console.log(doc.data()));
  });

  // Adding a new document to trigger onSnapshot
  const user5Ref = await usersCollection.add({ name: "Eve", age: 32 });
  console.log("Added User 5:", (await user5Ref.get()).data());

  // Wait to observe the polling effect, then unsubscribe
  await new Promise((resolve) => setTimeout(resolve, 1000));
  unsubscribe();

  console.log("Test completed.");
})().catch((error) => console.error("Test failed with error:", error));
