export class CreateFileStructure {
  constructor(fileStructureData) {
    try {
      this.fileStructure = this.initializePaths(fileStructureData);
    } catch (error) {
      throw new Error(
        `Error in constructor: Failed to initialize file structure. Reason: ${error.message}`
      );
    }
  }

  // Initialize paths for each item
  initializePaths(structure, parentPath = "") {
    try {
      return structure.map((item) => {
        const currentPath = parentPath
          ? `${parentPath}.${item.name}`
          : item.name;
        item.path = currentPath;
        if (item.children && item.children.length > 0) {
          item.children = this.initializePaths(item.children, currentPath);
        }
        return item;
      });
    } catch (error) {
      throw new Error(
        `Error in initializePaths: Failed to initialize paths. Reason: ${error.message}`
      );
    }
  }

  // Helper function to find an item by id, name, or child
  findItem(id, name, child, structure = this.fileStructure) {
    try {
      if (Array.isArray(structure)) {
        for (let item of structure) {
          if (item.id === id || item.name === name) return item;
          if (child && item.children) {
            const childItem = item.children.find(
              (c) => c.id === child.id || c.name === child.name
            );
            if (childItem) return item; // Return parent of child
          }
          if (item.children) {
            const result = this.findItem(id, name, child, item.children);
            if (result) return result;
          }
        }
      }
      return null;
    } catch (error) {
      throw new Error(
        `Error in findItem: Failed to find item. Reason: ${error.message}`
      );
    }
  }

  read(id, name, child) {
    try {
      if (!id && !name && !child)
        throw new Error(
          "Any one of identifier which is id, name, or child object is required to read from fileStructure"
        );

      const item = this.findItem(id, name, child);
      if (!item) throw new Error("Item not found");
      return item;
    } catch (error) {
      throw new Error(`Error in read: ${error.message}`);
    }
  }
  write(path, name) {
    try {
      console.log("In Write Method: Started write process");
      console.log(
        `In Write Method: Received path: '${path}' and file name: '${name}'`
      );

      const pathArray = path.split(".");
      let current = this.fileStructure;
      console.log("In Write Method: Path split into array:", pathArray);

      for (let part of pathArray) {
        console.log(`In Write Method: Processing part '${part}'`);

        let folder = current.find(
          (item) => item.name === part && item.isFolder
        );
        if (!folder) {
          console.log(
            `In Write Method: Folder '${part}' not found, creating new folder`
          );

          folder = { name: part, isFolder: true, children: [], path: "" };
          current.push(folder);

          folder.path = pathArray
            .slice(0, pathArray.indexOf(part) + 1)
            .join(".");
          console.log(`In Write Method: New folder created:`, folder);
        } else {
          console.log(`In Write Method: Folder '${part}' found`);
        }

        current = folder.children;
        console.log(
          `In Write Method: Moved into folder, current structure:`,
          current
        );
      }

      // Check if a file with the same name already exists in the current folder
      const existingFileInSameLevel = current.find(
        (item) => item.name === name && !item.isFolder
      );
      if (existingFileInSameLevel) {
        console.log(
          `In Write Method: File '${name}' already exists in this folder, throwing error`
        );
        throw new Error(`File with name ${name} already exists in this folder`);
      }

      console.log(
        `In Write Method: Reached target folder, creating new file '${name}'`
      );

      const newFile = { name, isFolder: false, path: `${path}.${name}` };
      current.push(newFile);

      console.log(
        "In Write Method: New file created and added to structure:",
        newFile
      );
      console.log(
        "In Write Method: Final structure:",
        JSON.stringify(this.fileStructure, null, 2)
      );
    } catch (error) {
      console.log(`In Write Method: Error occurred - ${error.message}`);
      throw new Error(`Error in write: ${error.message}`);
    }
  }

  delete(id, name, child) {
    try {
      let itemToDelete;
      console.log("In Delete Method: Initialized itemToDelete");

      // Recursive function to delete an item from nested structure
      const recursiveDelete = (structure) => {
        return structure.filter((file) => {
          if (file.children) {
            // Recursively filter the children
            file.children = recursiveDelete(file.children);
          }
          // If the current file matches the id or name, it will be filtered out (deleted)
          return !(file.id === id || file.name === name);
        });
      };

      if (child) {
        console.log("In Delete Method: Child parameter provided");

        // Find the parent of the child
        const parent = this.findItem(null, null, child);
        console.log("In Delete Method: Searching for the parent of the child");

        if (parent) {
          console.log(
            "In Delete Method: Parent found, preparing to delete the parent"
          );

          // Delete the parent from the structure
          this.fileStructure = recursiveDelete(this.fileStructure);
          console.log(
            "In Delete Method: Parent deleted from fileStructure",
            this.fileStructure
          );
          return { itemDeleted: parent, fileStructure: this.fileStructure };
        } else {
          console.log("In Delete Method: Parent not found, throwing error");
          throw new Error("Parent of the item to delete not found");
        }
      } else if (id || name) {
        console.log("In Delete Method: id or name parameter provided");

        // Perform the recursive deletion based on id or name
        this.fileStructure = recursiveDelete(this.fileStructure);

        itemToDelete = this.findItem(id, name, null);
        if (!itemToDelete) {
          console.log(
            "In Delete Method: Item deleted from fileStructure",
            this.fileStructure
          );
          return {
            itemDeleted: { id, name },
            fileStructure: this.fileStructure,
          };
        } else {
          console.log(
            "In Delete Method: Item to delete not found, throwing error"
          );
          throw new Error("Item to delete not found");
        }
      }

      if (!itemToDelete) {
        console.log(
          "In Delete Method: No item set for deletion, throwing error"
        );
        throw new Error("Item to delete not found");
      }
    } catch (error) {
      console.log(`In Delete Method: Error occurred - ${error.message}`);
      throw new Error(`Error in delete: ${error.message}`);
    }
  }

  update(id, name, child, propertyToUpdate, value) {
    try {
      console.log("In Update Method: Started update process");

      const item = this.findItem(id, name, child);
      console.log(
        `In Update Method: Searching for item with id: ${id}, name: ${name}, child: ${child}`
      );

      if (!item) {
        console.log("In Update Method: Item not found, throwing error");
        throw new Error("Item not found");
      }

      console.log("In Update Method: Item found", item);

      if (!(propertyToUpdate in item)) {
        console.log(
          `In Update Method: Property '${propertyToUpdate}' does not exist on item, throwing error`
        );
        throw new Error(
          `Property '${propertyToUpdate}' does not exist on item`
        );
      }

      console.log(
        `In Update Method: Property '${propertyToUpdate}' exists, updating value to ${value}`
      );

      item[propertyToUpdate] = value;

      console.log("In Update Method: Update successful", item);
    } catch (error) {
      console.log(`In Update Method: Error occurred - ${error.message}`);
      throw new Error(`Error in update: ${error.message}`);
    }
  }

  move(fromId, fromName, fromChild, toPath) {
    try {
      console.log("In Move Method: Started move process");

      let itemToMove = this.findItem(fromId, fromName, fromChild);
      if (!itemToMove) throw new Error("Item to move not found");

      // Create a deep copy of the item to move
      itemToMove = JSON.parse(JSON.stringify(itemToMove));

      // Delete the original item
      this.delete(fromId, fromName, fromChild);

      // Prepare the new path and update the item's path
      const newPath = `${toPath}.${itemToMove.name}`;
      itemToMove.path = newPath;

      const pathArray = toPath.split(".");
      let current = this.fileStructure;

      // Traverse the file structure to find the target folder
      for (let i = 0; i < pathArray.length; i++) {
        const part = pathArray[i];
        let folder = current.find(
          (item) => item.name === part && item.isFolder
        );

        if (!folder) {
          folder = {
            name: part,
            isFolder: true,
            children: [],
            path: pathArray.slice(0, i + 1).join("."),
          };
          current.push(folder);
        }

        if (i === pathArray.length - 1) {
          // We've reached the target folder, add the item here
          folder.children.push(itemToMove);
        } else {
          // Move to the next level
          current = folder.children;
        }
      }

      // Update the paths of all children recursively
      const updateChildPaths = (item) => {
        if (item.children) {
          item.children.forEach((child) => {
            child.path = `${item.path}.${child.name}`;
            updateChildPaths(child);
          });
        }
      };

      updateChildPaths(itemToMove);

      console.log("In Move Method: Move successful");
    } catch (error) {
      console.log(`In Move Method: Error occurred - ${error.message}`);
      throw new Error(`Error in move: ${error.message}`);
    }
  }
}
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function testCreateFileStructure() {
  let fileStructure;

  function resetFileStructure() {
    const testData = [
      {
        id: "folder_1",
        name: "react-blog-app",
        isFolder: true,
        children: [
          {
            id: "folder_2",
            name: "public",
            isFolder: true,
            children: [
              {
                id: "file_1",
                name: "index.html",
                isFolder: false,
                code: "",
                ast: {},
              },
              {
                id: "file_2",
                name: "favicon.ico",
                isFolder: false,
                code: "",
                ast: {},
              },
            ],
          },
          {
            id: "folder_3",
            name: "src",
            isFolder: true,
            children: [
              {
                id: "folder_4",
                name: "assets",
                isFolder: true,
                children: [
                  {
                    id: "file_4",
                    name: "images",
                    isFolder: true,
                    children: [],
                  },
                  { id: "file_5", name: "fonts", isFolder: true, children: [] },
                  {
                    id: "file_6",
                    name: "index.css",
                    isFolder: false,
                    code: "",
                    ast: {},
                  },
                ],
              },
              {
                id: "folder_5",
                name: "components",
                isFolder: true,
                children: [
                  {
                    id: "file_7",
                    name: "Button.js",
                    isFolder: false,
                    code: "",
                    ast: {},
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    fileStructure = new CreateFileStructure(testData);
  }

  function runTests() {
    console.log("Running tests...");

    // Test: Initialize paths correctly
    resetFileStructure();
    let item = fileStructure.read("folder_1");
    console.log(fileStructure);
    assert(
      item.path === "react-blog-app",
      "Path initialization failed for folder_1"
    );

    let childItem = fileStructure.read(null, "public");
    console.log(fileStructure);
    assert(
      childItem.path === "react-blog-app.public",
      "Path initialization failed for public"
    );

    // Test: Read an item by id, name, or child
    resetFileStructure();
    let itemById = fileStructure.read("file_1");
    console.log(fileStructure);
    assert(itemById.name === "index.html", "Failed to read item by id");

    let itemByName = fileStructure.read(null, "Button.js");
    console.log(fileStructure);
    assert(itemByName.id === "file_7", "Failed to read item by name");

    let parentByChild = fileStructure.read(null, null, { id: "file_7" });
    console.log(fileStructure);
    assert(
      parentByChild.name === "components",
      "Failed to read parent by child"
    );

    // Test: Write a new file in the correct path
    resetFileStructure();

    fileStructure.write("react-blog-app.src.components", "NewComponent.js");
    console.log(fileStructure);
    let newItem = fileStructure.read(null, "NewComponent.js");
    console.log(fileStructure);
    assert(newItem.name === "NewComponent.js", "Failed to write new file");
    assert(
      newItem.path === "react-blog-app.src.components.NewComponent.js",
      "Path is incorrect for the new file"
    );

    // Test: Delete an item by id, name, or child
    resetFileStructure();
    fileStructure.delete("file_2");
    console.log(fileStructure);
    try {
      fileStructure.read(null, "file_2", null);
      console.log(fileStructure, ' fileStructure.read(null, "file_2", null);');
      assert(false, "Failed to delete item by id");
    } catch (e) {
      assert(
        e.message === "Error in read: Item not found",
        `Incorrect error message when item is not found: ${e.message}`
      );
    }

    fileStructure.delete(null, "Button.js", null);
    console.log(fileStructure, "afterDelete");
    try {
      const item = fileStructure.read(null, "Button.js", null);
      console.log(item, "Failed to delete item by na");
      assert(false, "Failed to delete item by name");
    } catch (e) {
      assert(
        e.message.includes("Item not found"),
        `Incorrect error message when item is not found: ${e.message}`
      );
    }

    // Test: Update an item's property correctly
    resetFileStructure();
    console.log(fileStructure);
    const up = fileStructure.update(
      "file_1",
      null,
      null,
      "code",
      "<html></html>"
    );
    console.log(fileStructure, up, "upupup");
    let updatedItem = fileStructure.read("file_1");
    console.log(updatedItem, "upupup");
    assert(
      updatedItem.code === "<html></html>",
      "Failed to update item's property"
    );

    // Test: Move an item to a new path and update its path property
    resetFileStructure();
    fileStructure.move("file_1", null, null, "react-blog-app.src.assets");
    console.log(fileStructure, 'fileStructure.read("file_1");');
    let movedItem = fileStructure.read("file_1");
    console.log(fileStructure);
    assert(
      movedItem.path === "react-blog-app.src.assets.index.html",
      "Failed to move item to new path"
    );

    // Test: Handle errors correctly when invalid operations are performed
    resetFileStructure();
    try {
      fileStructure.read();
      console.log(fileStructure);
      assert(false, "Error handling failed for missing identifiers in read");
    } catch (e) {
      assert(
        e.message.includes("required to read from fileStructure"),
        "Incorrect error handling for missing identifiers in read"
      );
    }

    try {
      fileStructure.update("nonexistent_id", null, null, "code", "");
      console.log(fileStructure);
      assert(false, "Error handling failed for updating a non-existent item");
    } catch (e) {
      console.log(e.message, "e.message");
      assert(
        e.message.includes("Item not found"),
        "Incorrect error message when item is not found for update"
      );
    }

    try {
      fileStructure.write("react-blog-app.public", "index.html");
      console.log(fileStructure);
      assert(false, "Error handling failed for writing duplicate file");
    } catch (e) {
      console.log(e.message); // This should log the expected error message.
      assert(
        e.message.includes(
          "File with name index.html already exists in this folder"
        ),
        "Incorrect error handling for duplicate file write"
      );
    }

    try {
      fileStructure.move("nonexistent_id", null, null, "react-blog-app.src");
      console.log(fileStructure);
      assert(false, "Error handling failed for moving a non-existent item");
    } catch (e) {
      assert(
        e.message.includes("Item to move not found"),
        "Incorrect error handling for moving a non-existent item"
      );
    }

    // Test: Handle complex nested operations
    resetFileStructure();
    fileStructure.write("react-blog-app.src.features.newFeature", "Feature.js");
    console.log(fileStructure);
    let newFile = fileStructure.read(null, "Feature.js");
    assert(
      newFile.path === "react-blog-app.src.features.newFeature.Feature.js",
      "Failed to handle complex nested write operation"
    );

    fileStructure.move("folder_4", null, null, "react-blog-app.public");
    console.log(fileStructure);
    let movedFolder = fileStructure.read("folder_4");
    console.log(fileStructure);
    assert(
      movedFolder.path === "react-blog-app.public.assets",
      "Failed to handle complex nested move operation"
    );

    fileStructure.delete("folder_5");
    console.log(fileStructure);
    try {
      fileStructure.read("folder_5");
      console.log(fileStructure);
      assert(false, "Failed to handle complex nested delete operation");
    } catch (e) {
      assert(
        e.message.includes("Item not found"),
        "Incorrect error message for complex nested delete operation"
      );
    }

    console.log("All tests passed!");
  }

  runTests();
}

testCreateFileStructure();
