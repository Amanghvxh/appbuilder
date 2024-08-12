function handleIndexedDBOperation(operation, ...args) {
  switch (operation) {
    case "indexedDB.open":
      return; // we will have to initilize this into a new file like we do firebase.firestore() initilization

    case "db.createObjectStore":
      return;

    case "db.deleteObjectStore":
      return;

    case "db.transaction":
      return;

    case "objectStore.add":
      return;

    case "objectStore.put":
      return;

    case "objectStore.get":
      return;

    case "objectStore.getAll":
      return;

    case "objectStore.getAllKeys":
      return;

    case "objectStore.getKey":
      return;

    case "objectStore.delete":
      return;

    case "objectStore.clear":
      return;

    case "objectStore.openCursor":
      return;

    case "objectStore.openKeyCursor":
      return;

    case "objectStore.createIndex":
      return;

    case "objectStore.index":
      return;

    case "index.get":
      return;

    case "index.getAll":
      return;

    case "index.getKey":
      return;

    case "index.openCursor":
      return;

    case "request.onerror":
      return;

    case "transaction.onerror":
      return;

    case "indexedDB.deleteDatabase":
      return;

    case "db.close":
      return;

    default:
      throw new Error("Unknown IndexedDB operation");
  }
}
