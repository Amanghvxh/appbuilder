function compileToFirestore(ast) {
  const firestoreCode = [];

  ast.body.forEach((node) => {
    if (node.type === "FunctionDeclaration") {
      firestoreCode.push(compileFunction(node));
    }
  });

  return firestoreCode.join("\n");
}

function compileFunction(node) {
  const functionName = node.id.name;
  const params = node.params.map((param) => param.name).join(", ");

  return `
      async function ${functionName}(${params}) {
        ${compileBlockStatement(node.body)}
      }
    `;
}

function compileBlockStatement(block) {
  return block.body.map(compileStatement).join("\n");
}

function compileStatement(statement) {
  switch (statement.type) {
    case "VariableDeclaration":
      return compileVariableDeclaration(statement);
    case "ExpressionStatement":
      return compileExpression(statement.expression);
    case "ReturnStatement":
      return compileReturnStatement(statement);
    case "IfStatement":
      return compileIfStatement(statement);
    default:
      console.error("Unhandled statement type:", statement.type);
      return "";
  }
}

function compileVariableDeclaration(statement) {
  const declarations = statement.declarations
    .map((decl) => {
      const name = decl.id.name;
      const init = compileExpression(decl.init);
      return `${statement.kind} ${name} = ${init};`;
    })
    .join("\n");
  return declarations;
}

function compileExpression(expression) {
  if (!expression) return "null";
  if (isIndexedDBOperation(expression)) {
    return compileIndexedDBToFirestore(expression);
  }
  switch (expression.type) {
    case "CallExpression":
      return compileCallExpression(expression);
    case "MemberExpression":
      return compileMemberExpression(expression);
    case "Literal":
      return expression.raw;
    case "Identifier":
      return expression.name;
    case "AssignmentExpression":
      return compileAssignmentExpression(expression);
    case "NewExpression":
      return compileNewExpression(expression);
    case "UnaryExpression":
      return compileUnaryExpression(expression);
    default:
      console.error("Unhandled expression type:", expression.type);
      return "";
  }
}

function isIndexedDBOperation(expression) {
  if (expression.type !== "CallExpression") return false;
  if (expression.callee.type !== "MemberExpression") return false;

  const object = expression.callee.object.name;
  const method = expression.callee.property.name;

  return (
    ["indexedDB", "db", "objectStore", "index"].includes(object) ||
    [
      "createObjectStore",
      "deleteObjectStore",
      "transaction",
      "add",
      "put",
      "get",
      "getAll",
      "getAllKeys",
      "getKey",
      "delete",
      "clear",
      "openCursor",
      "openKeyCursor",
      "createIndex",
      "index",
    ].includes(method)
  );
}

function compileIndexedDBToFirestore(expression) {
  const callee = expression.callee;
  const object = callee.object.name;
  const method = callee.property.name;

  switch (`${object}.${method}`) {
    case "indexedDB.open":
      return `firebase.firestore()`;
    case "indexedDB.deleteDatabase":
      return `firebase.firestore().disableNetwork()`;
    case "db.createObjectStore":
      return `// No direct equivalent for createObjectStore in Firestore`;
    case "db.deleteObjectStore":
      return `// Emulate deleteObjectStore with batch delete`;
    case "db.transaction":
      return `firebase.firestore().runTransaction(async (transaction) => {
          // Transaction logic here
        })`;
    case "objectStore.add":
      return `collection.add(${compileExpression(expression.arguments[0])})`;
    case "objectStore.put":
      return `collection.doc(${compileExpression(
        expression.arguments[1]
      )}).set(${compileExpression(expression.arguments[0])})`;
    case "objectStore.get":
      return `collection.doc(${compileExpression(
        expression.arguments[0]
      )}).get()`;
    case "objectStore.getAll":
      return `collection.get()`;
    case "objectStore.getAllKeys":
      return `(await collection.get()).docs.map(doc => doc.id)`;
    case "objectStore.getKey":
      return `(await collection.where(${compileExpression(
        expression.arguments[0]
      )}).limit(1).get()).docs[0]?.id`;
    case "objectStore.delete":
      return `collection.doc(${compileExpression(
        expression.arguments[0]
      )}).delete()`;
    case "objectStore.clear":
      return `
          const batch = firebase.firestore().batch();
          const snapshot = await collection.get();
          snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });
          await batch.commit();
        `;
    case "objectStore.openCursor":
    case "objectStore.openKeyCursor":
      return `
          const snapshot = await collection.get();
          for (const doc of snapshot.docs) {
            // Cursor logic here
          }
        `;
    case "objectStore.createIndex":
      return `// No direct equivalent for createIndex in Firestore. Consider using subcollections or denormalizing data.`;
    case "objectStore.index":
      return `// No direct equivalent for index in Firestore. Query on fields directly.`;
    case "index.get":
    case "index.getAll":
      return `collection.where(${compileExpression(
        expression.arguments[0]
      )}).get()`;
    case "index.getKey":
      return `(await collection.where(${compileExpression(
        expression.arguments[0]
      )}).limit(1).get()).docs[0]?.id`;
    case "index.openCursor":
      return `
          const snapshot = await collection.where(${compileExpression(
            expression.arguments[0]
          )}).get();
          for (const doc of snapshot.docs) {
            // Cursor logic here
          }
        `;
    default:
      return compileCallExpression(expression);
  }
}

function compileCallExpression(expression) {
  const callee = compileExpression(expression.callee);
  const args = expression.arguments.map(compileExpression).join(", ");
  return `${callee}(${args})`;
}

function compileMemberExpression(expression) {
  const object = compileExpression(expression.object);
  const property = compileExpression(expression.property);
  return `${object}.${property}`;
}

function compileAssignmentExpression(expression) {
  const left = compileExpression(expression.left);
  const right = compileExpression(expression.right);
  return `${left} = ${right}`;
}

function compileNewExpression(expression) {
  const callee = compileExpression(expression.callee);
  const args = expression.arguments.map(compileExpression).join(", ");
  return `new ${callee}(${args})`;
}

function compileUnaryExpression(expression) {
  const argument = compileExpression(expression.argument);
  return `${expression.operator}${argument}`;
}

function compileReturnStatement(statement) {
  const argument = compileExpression(statement.argument);
  return `return ${argument};`;
}

function compileIfStatement(statement) {
  const test = compileExpression(statement.test);
  const consequent = compileBlockStatement(statement.consequent);
  const alternate = statement.alternate
    ? compileBlockStatement(statement.alternate)
    : "";
  return `if (${test}) { ${consequent} } ${
    alternate ? `else { ${alternate} }` : ""
  }`;
}

const ast = {
  type: "Program",
  start: 0,
  end: 2688,
  body: [
    {
      type: "FunctionDeclaration",
      start: 0,
      end: 668,
      id: {
        type: "Identifier",
        start: 15,
        end: 37,
        name: "writeDocumentIndexedDB",
      },
      expression: false,
      generator: false,
      async: true,
      params: [
        {
          type: "Identifier",
          start: 38,
          end: 44,
          name: "dbName",
        },
        {
          type: "Identifier",
          start: 46,
          end: 60,
          name: "collectionName",
        },
        {
          type: "Identifier",
          start: 62,
          end: 67,
          name: "docId",
        },
        {
          type: "Identifier",
          start: 69,
          end: 73,
          name: "data",
        },
      ],
      body: {
        type: "BlockStatement",
        start: 75,
        end: 668,
        body: [
          {
            type: "VariableDeclaration",
            start: 81,
            end: 119,
            declarations: [
              {
                type: "VariableDeclarator",
                start: 87,
                end: 118,
                id: {
                  type: "Identifier",
                  start: 87,
                  end: 89,
                  name: "db",
                },
                init: {
                  type: "AwaitExpression",
                  start: 92,
                  end: 118,
                  argument: {
                    type: "CallExpression",
                    start: 98,
                    end: 118,
                    callee: {
                      type: "Identifier",
                      start: 98,
                      end: 110,
                      name: "openDatabase",
                    },
                    arguments: [
                      {
                        type: "Identifier",
                        start: 111,
                        end: 117,
                        name: "dbName",
                      },
                    ],
                    optional: false,
                  },
                },
              },
            ],
            kind: "const",
          },
          {
            type: "VariableDeclaration",
            start: 124,
            end: 188,
            declarations: [
              {
                type: "VariableDeclarator",
                start: 130,
                end: 187,
                id: {
                  type: "Identifier",
                  start: 130,
                  end: 141,
                  name: "transaction",
                },
                init: {
                  type: "CallExpression",
                  start: 144,
                  end: 187,
                  callee: {
                    type: "MemberExpression",
                    start: 144,
                    end: 158,
                    object: {
                      type: "Identifier",
                      start: 144,
                      end: 146,
                      name: "db",
                    },
                    property: {
                      type: "Identifier",
                      start: 147,
                      end: 158,
                      name: "transaction",
                    },
                    computed: false,
                    optional: false,
                  },
                  arguments: [
                    {
                      type: "Identifier",
                      start: 159,
                      end: 173,
                      name: "collectionName",
                    },
                    {
                      type: "Literal",
                      start: 175,
                      end: 186,
                      value: "readwrite",
                      raw: "'readwrite'",
                    },
                  ],
                  optional: false,
                },
              },
            ],
            kind: "const",
          },
          {
            type: "VariableDeclaration",
            start: 193,
            end: 247,
            declarations: [
              {
                type: "VariableDeclarator",
                start: 199,
                end: 246,
                id: {
                  type: "Identifier",
                  start: 199,
                  end: 204,
                  name: "store",
                },
                init: {
                  type: "CallExpression",
                  start: 207,
                  end: 246,
                  callee: {
                    type: "MemberExpression",
                    start: 207,
                    end: 230,
                    object: {
                      type: "Identifier",
                      start: 207,
                      end: 218,
                      name: "transaction",
                    },
                    property: {
                      type: "Identifier",
                      start: 219,
                      end: 230,
                      name: "objectStore",
                    },
                    computed: false,
                    optional: false,
                  },
                  arguments: [
                    {
                      type: "Identifier",
                      start: 231,
                      end: 245,
                      name: "collectionName",
                    },
                  ],
                  optional: false,
                },
              },
            ],
            kind: "const",
          },
          {
            type: "ExpressionStatement",
            start: 257,
            end: 273,
            expression: {
              type: "AssignmentExpression",
              start: 257,
              end: 272,
              operator: "=",
              left: {
                type: "MemberExpression",
                start: 257,
                end: 264,
                object: {
                  type: "Identifier",
                  start: 257,
                  end: 261,
                  name: "data",
                },
                property: {
                  type: "Identifier",
                  start: 262,
                  end: 264,
                  name: "id",
                },
                computed: false,
                optional: false,
              },
              right: {
                type: "Identifier",
                start: 267,
                end: 272,
                name: "docId",
              },
            },
          },
          {
            type: "ExpressionStatement",
            start: 278,
            end: 294,
            expression: {
              type: "CallExpression",
              start: 278,
              end: 293,
              callee: {
                type: "MemberExpression",
                start: 278,
                end: 287,
                object: {
                  type: "Identifier",
                  start: 278,
                  end: 283,
                  name: "store",
                },
                property: {
                  type: "Identifier",
                  start: 284,
                  end: 287,
                  name: "put",
                },
                computed: false,
                optional: false,
              },
              arguments: [
                {
                  type: "Identifier",
                  start: 288,
                  end: 292,
                  name: "data",
                },
              ],
              optional: false,
            },
          },
          {
            type: "ReturnStatement",
            start: 300,
            end: 666,
            argument: {
              type: "NewExpression",
              start: 307,
              end: 665,
              callee: {
                type: "Identifier",
                start: 311,
                end: 318,
                name: "Promise",
              },
              arguments: [
                {
                  type: "ArrowFunctionExpression",
                  start: 319,
                  end: 664,
                  id: null,
                  expression: false,
                  generator: false,
                  async: false,
                  params: [
                    {
                      type: "Identifier",
                      start: 320,
                      end: 327,
                      name: "resolve",
                    },
                    {
                      type: "Identifier",
                      start: 329,
                      end: 335,
                      name: "reject",
                    },
                  ],
                  body: {
                    type: "BlockStatement",
                    start: 340,
                    end: 664,
                    body: [
                      {
                        type: "ExpressionStatement",
                        start: 350,
                        end: 515,
                        expression: {
                          type: "AssignmentExpression",
                          start: 350,
                          end: 514,
                          operator: "=",
                          left: {
                            type: "MemberExpression",
                            start: 350,
                            end: 372,
                            object: {
                              type: "Identifier",
                              start: 350,
                              end: 361,
                              name: "transaction",
                            },
                            property: {
                              type: "Identifier",
                              start: 362,
                              end: 372,
                              name: "oncomplete",
                            },
                            computed: false,
                            optional: false,
                          },
                          right: {
                            type: "ArrowFunctionExpression",
                            start: 375,
                            end: 514,
                            id: null,
                            expression: false,
                            generator: false,
                            async: false,
                            params: [],
                            body: {
                              type: "BlockStatement",
                              start: 381,
                              end: 514,
                              body: [
                                {
                                  type: "ExpressionStatement",
                                  start: 395,
                                  end: 481,
                                  expression: {
                                    type: "CallExpression",
                                    start: 395,
                                    end: 480,
                                    callee: {
                                      type: "MemberExpression",
                                      start: 395,
                                      end: 406,
                                      object: {
                                        type: "Identifier",
                                        start: 395,
                                        end: 402,
                                        name: "console",
                                      },
                                      property: {
                                        type: "Identifier",
                                        start: 403,
                                        end: 406,
                                        name: "log",
                                      },
                                      computed: false,
                                      optional: false,
                                    },
                                    arguments: [
                                      {
                                        type: "TemplateLiteral",
                                        start: 407,
                                        end: 479,
                                        expressions: [
                                          {
                                            type: "Identifier",
                                            start: 419,
                                            end: 424,
                                            name: "docId",
                                          },
                                          {
                                            type: "Identifier",
                                            start: 463,
                                            end: 477,
                                            name: "collectionName",
                                          },
                                        ],
                                        quasis: [
                                          {
                                            type: "TemplateElement",
                                            start: 408,
                                            end: 417,
                                            value: {
                                              raw: "Document ",
                                              cooked: "Document ",
                                            },
                                            tail: false,
                                          },
                                          {
                                            type: "TemplateElement",
                                            start: 425,
                                            end: 461,
                                            value: {
                                              raw: " written successfully in collection ",
                                              cooked:
                                                " written successfully in collection ",
                                            },
                                            tail: false,
                                          },
                                          {
                                            type: "TemplateElement",
                                            start: 478,
                                            end: 478,
                                            value: {
                                              raw: "",
                                              cooked: "",
                                            },
                                            tail: true,
                                          },
                                        ],
                                      },
                                    ],
                                    optional: false,
                                  },
                                },
                                {
                                  type: "ExpressionStatement",
                                  start: 494,
                                  end: 504,
                                  expression: {
                                    type: "CallExpression",
                                    start: 494,
                                    end: 503,
                                    callee: {
                                      type: "Identifier",
                                      start: 494,
                                      end: 501,
                                      name: "resolve",
                                    },
                                    arguments: [],
                                    optional: false,
                                  },
                                },
                              ],
                            },
                          },
                        },
                      },
                      {
                        type: "ExpressionStatement",
                        start: 524,
                        end: 658,
                        expression: {
                          type: "AssignmentExpression",
                          start: 524,
                          end: 657,
                          operator: "=",
                          left: {
                            type: "MemberExpression",
                            start: 524,
                            end: 543,
                            object: {
                              type: "Identifier",
                              start: 524,
                              end: 535,
                              name: "transaction",
                            },
                            property: {
                              type: "Identifier",
                              start: 536,
                              end: 543,
                              name: "onerror",
                            },
                            computed: false,
                            optional: false,
                          },
                          right: {
                            type: "ArrowFunctionExpression",
                            start: 546,
                            end: 657,
                            id: null,
                            expression: false,
                            generator: false,
                            async: false,
                            params: [
                              {
                                type: "Identifier",
                                start: 547,
                                end: 552,
                                name: "error",
                              },
                            ],
                            body: {
                              type: "BlockStatement",
                              start: 557,
                              end: 657,
                              body: [
                                {
                                  type: "ExpressionStatement",
                                  start: 571,
                                  end: 620,
                                  expression: {
                                    type: "CallExpression",
                                    start: 571,
                                    end: 619,
                                    callee: {
                                      type: "MemberExpression",
                                      start: 571,
                                      end: 584,
                                      object: {
                                        type: "Identifier",
                                        start: 571,
                                        end: 578,
                                        name: "console",
                                      },
                                      property: {
                                        type: "Identifier",
                                        start: 579,
                                        end: 584,
                                        name: "error",
                                      },
                                      computed: false,
                                      optional: false,
                                    },
                                    arguments: [
                                      {
                                        type: "Literal",
                                        start: 585,
                                        end: 611,
                                        value: "Error writing document: ",
                                        raw: '"Error writing document: "',
                                      },
                                      {
                                        type: "Identifier",
                                        start: 613,
                                        end: 618,
                                        name: "error",
                                      },
                                    ],
                                    optional: false,
                                  },
                                },
                                {
                                  type: "ExpressionStatement",
                                  start: 633,
                                  end: 647,
                                  expression: {
                                    type: "CallExpression",
                                    start: 633,
                                    end: 646,
                                    callee: {
                                      type: "Identifier",
                                      start: 633,
                                      end: 639,
                                      name: "reject",
                                    },
                                    arguments: [
                                      {
                                        type: "Identifier",
                                        start: 640,
                                        end: 645,
                                        name: "error",
                                      },
                                    ],
                                    optional: false,
                                  },
                                },
                              ],
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      type: "FunctionDeclaration",
      start: 670,
      end: 1513,
      id: {
        type: "Identifier",
        start: 685,
        end: 706,
        name: "readDocumentIndexedDB",
      },
      expression: false,
      generator: false,
      async: true,
      params: [
        {
          type: "Identifier",
          start: 707,
          end: 713,
          name: "dbName",
        },
        {
          type: "Identifier",
          start: 715,
          end: 729,
          name: "collectionName",
        },
        {
          type: "Identifier",
          start: 731,
          end: 736,
          name: "docId",
        },
      ],
      body: {
        type: "BlockStatement",
        start: 738,
        end: 1513,
        body: [
          {
            type: "VariableDeclaration",
            start: 744,
            end: 782,
            declarations: [
              {
                type: "VariableDeclarator",
                start: 750,
                end: 781,
                id: {
                  type: "Identifier",
                  start: 750,
                  end: 752,
                  name: "db",
                },
                init: {
                  type: "AwaitExpression",
                  start: 755,
                  end: 781,
                  argument: {
                    type: "CallExpression",
                    start: 761,
                    end: 781,
                    callee: {
                      type: "Identifier",
                      start: 761,
                      end: 773,
                      name: "openDatabase",
                    },
                    arguments: [
                      {
                        type: "Identifier",
                        start: 774,
                        end: 780,
                        name: "dbName",
                      },
                    ],
                    optional: false,
                  },
                },
              },
            ],
            kind: "const",
          },
          {
            type: "VariableDeclaration",
            start: 787,
            end: 850,
            declarations: [
              {
                type: "VariableDeclarator",
                start: 793,
                end: 849,
                id: {
                  type: "Identifier",
                  start: 793,
                  end: 804,
                  name: "transaction",
                },
                init: {
                  type: "CallExpression",
                  start: 807,
                  end: 849,
                  callee: {
                    type: "MemberExpression",
                    start: 807,
                    end: 821,
                    object: {
                      type: "Identifier",
                      start: 807,
                      end: 809,
                      name: "db",
                    },
                    property: {
                      type: "Identifier",
                      start: 810,
                      end: 821,
                      name: "transaction",
                    },
                    computed: false,
                    optional: false,
                  },
                  arguments: [
                    {
                      type: "Identifier",
                      start: 822,
                      end: 836,
                      name: "collectionName",
                    },
                    {
                      type: "Literal",
                      start: 838,
                      end: 848,
                      value: "readonly",
                      raw: "'readonly'",
                    },
                  ],
                  optional: false,
                },
              },
            ],
            kind: "const",
          },
          {
            type: "VariableDeclaration",
            start: 855,
            end: 909,
            declarations: [
              {
                type: "VariableDeclarator",
                start: 861,
                end: 908,
                id: {
                  type: "Identifier",
                  start: 861,
                  end: 866,
                  name: "store",
                },
                init: {
                  type: "CallExpression",
                  start: 869,
                  end: 908,
                  callee: {
                    type: "MemberExpression",
                    start: 869,
                    end: 892,
                    object: {
                      type: "Identifier",
                      start: 869,
                      end: 880,
                      name: "transaction",
                    },
                    property: {
                      type: "Identifier",
                      start: 881,
                      end: 892,
                      name: "objectStore",
                    },
                    computed: false,
                    optional: false,
                  },
                  arguments: [
                    {
                      type: "Identifier",
                      start: 893,
                      end: 907,
                      name: "collectionName",
                    },
                  ],
                  optional: false,
                },
              },
            ],
            kind: "const",
          },
          {
            type: "ReturnStatement",
            start: 919,
            end: 1511,
            argument: {
              type: "NewExpression",
              start: 926,
              end: 1510,
              callee: {
                type: "Identifier",
                start: 930,
                end: 937,
                name: "Promise",
              },
              arguments: [
                {
                  type: "ArrowFunctionExpression",
                  start: 938,
                  end: 1509,
                  id: null,
                  expression: false,
                  generator: false,
                  async: false,
                  params: [
                    {
                      type: "Identifier",
                      start: 939,
                      end: 946,
                      name: "resolve",
                    },
                    {
                      type: "Identifier",
                      start: 948,
                      end: 954,
                      name: "reject",
                    },
                  ],
                  body: {
                    type: "BlockStatement",
                    start: 959,
                    end: 1509,
                    body: [
                      {
                        type: "VariableDeclaration",
                        start: 969,
                        end: 1002,
                        declarations: [
                          {
                            type: "VariableDeclarator",
                            start: 975,
                            end: 1001,
                            id: {
                              type: "Identifier",
                              start: 975,
                              end: 982,
                              name: "request",
                            },
                            init: {
                              type: "CallExpression",
                              start: 985,
                              end: 1001,
                              callee: {
                                type: "MemberExpression",
                                start: 985,
                                end: 994,
                                object: {
                                  type: "Identifier",
                                  start: 985,
                                  end: 990,
                                  name: "store",
                                },
                                property: {
                                  type: "Identifier",
                                  start: 991,
                                  end: 994,
                                  name: "get",
                                },
                                computed: false,
                                optional: false,
                              },
                              arguments: [
                                {
                                  type: "Identifier",
                                  start: 995,
                                  end: 1000,
                                  name: "docId",
                                },
                              ],
                              optional: false,
                            },
                          },
                        ],
                        kind: "const",
                      },
                      {
                        type: "ExpressionStatement",
                        start: 1011,
                        end: 1364,
                        expression: {
                          type: "AssignmentExpression",
                          start: 1011,
                          end: 1363,
                          operator: "=",
                          left: {
                            type: "MemberExpression",
                            start: 1011,
                            end: 1028,
                            object: {
                              type: "Identifier",
                              start: 1011,
                              end: 1018,
                              name: "request",
                            },
                            property: {
                              type: "Identifier",
                              start: 1019,
                              end: 1028,
                              name: "onsuccess",
                            },
                            computed: false,
                            optional: false,
                          },
                          right: {
                            type: "ArrowFunctionExpression",
                            start: 1031,
                            end: 1363,
                            id: null,
                            expression: false,
                            generator: false,
                            async: false,
                            params: [
                              {
                                type: "Identifier",
                                start: 1032,
                                end: 1037,
                                name: "event",
                              },
                            ],
                            body: {
                              type: "BlockStatement",
                              start: 1042,
                              end: 1363,
                              body: [
                                {
                                  type: "IfStatement",
                                  start: 1056,
                                  end: 1353,
                                  test: {
                                    type: "MemberExpression",
                                    start: 1060,
                                    end: 1079,
                                    object: {
                                      type: "MemberExpression",
                                      start: 1060,
                                      end: 1072,
                                      object: {
                                        type: "Identifier",
                                        start: 1060,
                                        end: 1065,
                                        name: "event",
                                      },
                                      property: {
                                        type: "Identifier",
                                        start: 1066,
                                        end: 1072,
                                        name: "target",
                                      },
                                      computed: false,
                                      optional: false,
                                    },
                                    property: {
                                      type: "Identifier",
                                      start: 1073,
                                      end: 1079,
                                      name: "result",
                                    },
                                    computed: false,
                                    optional: false,
                                  },
                                  consequent: {
                                    type: "BlockStatement",
                                    start: 1081,
                                    end: 1219,
                                    body: [
                                      {
                                        type: "ExpressionStatement",
                                        start: 1099,
                                        end: 1159,
                                        expression: {
                                          type: "CallExpression",
                                          start: 1099,
                                          end: 1158,
                                          callee: {
                                            type: "MemberExpression",
                                            start: 1099,
                                            end: 1110,
                                            object: {
                                              type: "Identifier",
                                              start: 1099,
                                              end: 1106,
                                              name: "console",
                                            },
                                            property: {
                                              type: "Identifier",
                                              start: 1107,
                                              end: 1110,
                                              name: "log",
                                            },
                                            computed: false,
                                            optional: false,
                                          },
                                          arguments: [
                                            {
                                              type: "TemplateLiteral",
                                              start: 1111,
                                              end: 1136,
                                              expressions: [
                                                {
                                                  type: "Identifier",
                                                  start: 1123,
                                                  end: 1128,
                                                  name: "docId",
                                                },
                                              ],
                                              quasis: [
                                                {
                                                  type: "TemplateElement",
                                                  start: 1112,
                                                  end: 1121,
                                                  value: {
                                                    raw: "Document ",
                                                    cooked: "Document ",
                                                  },
                                                  tail: false,
                                                },
                                                {
                                                  type: "TemplateElement",
                                                  start: 1129,
                                                  end: 1135,
                                                  value: {
                                                    raw: " data:",
                                                    cooked: " data:",
                                                  },
                                                  tail: true,
                                                },
                                              ],
                                            },
                                            {
                                              type: "MemberExpression",
                                              start: 1138,
                                              end: 1157,
                                              object: {
                                                type: "MemberExpression",
                                                start: 1138,
                                                end: 1150,
                                                object: {
                                                  type: "Identifier",
                                                  start: 1138,
                                                  end: 1143,
                                                  name: "event",
                                                },
                                                property: {
                                                  type: "Identifier",
                                                  start: 1144,
                                                  end: 1150,
                                                  name: "target",
                                                },
                                                computed: false,
                                                optional: false,
                                              },
                                              property: {
                                                type: "Identifier",
                                                start: 1151,
                                                end: 1157,
                                                name: "result",
                                              },
                                              computed: false,
                                              optional: false,
                                            },
                                          ],
                                          optional: false,
                                        },
                                      },
                                      {
                                        type: "ExpressionStatement",
                                        start: 1176,
                                        end: 1205,
                                        expression: {
                                          type: "CallExpression",
                                          start: 1176,
                                          end: 1204,
                                          callee: {
                                            type: "Identifier",
                                            start: 1176,
                                            end: 1183,
                                            name: "resolve",
                                          },
                                          arguments: [
                                            {
                                              type: "MemberExpression",
                                              start: 1184,
                                              end: 1203,
                                              object: {
                                                type: "MemberExpression",
                                                start: 1184,
                                                end: 1196,
                                                object: {
                                                  type: "Identifier",
                                                  start: 1184,
                                                  end: 1189,
                                                  name: "event",
                                                },
                                                property: {
                                                  type: "Identifier",
                                                  start: 1190,
                                                  end: 1196,
                                                  name: "target",
                                                },
                                                computed: false,
                                                optional: false,
                                              },
                                              property: {
                                                type: "Identifier",
                                                start: 1197,
                                                end: 1203,
                                                name: "result",
                                              },
                                              computed: false,
                                              optional: false,
                                            },
                                          ],
                                          optional: false,
                                        },
                                      },
                                    ],
                                  },
                                  alternate: {
                                    type: "BlockStatement",
                                    start: 1225,
                                    end: 1353,
                                    body: [
                                      {
                                        type: "ExpressionStatement",
                                        start: 1243,
                                        end: 1308,
                                        expression: {
                                          type: "CallExpression",
                                          start: 1243,
                                          end: 1307,
                                          callee: {
                                            type: "MemberExpression",
                                            start: 1243,
                                            end: 1254,
                                            object: {
                                              type: "Identifier",
                                              start: 1243,
                                              end: 1250,
                                              name: "console",
                                            },
                                            property: {
                                              type: "Identifier",
                                              start: 1251,
                                              end: 1254,
                                              name: "log",
                                            },
                                            computed: false,
                                            optional: false,
                                          },
                                          arguments: [
                                            {
                                              type: "TemplateLiteral",
                                              start: 1255,
                                              end: 1306,
                                              expressions: [
                                                {
                                                  type: "Identifier",
                                                  start: 1289,
                                                  end: 1303,
                                                  name: "collectionName",
                                                },
                                              ],
                                              quasis: [
                                                {
                                                  type: "TemplateElement",
                                                  start: 1256,
                                                  end: 1287,
                                                  value: {
                                                    raw: "No such document in collection ",
                                                    cooked:
                                                      "No such document in collection ",
                                                  },
                                                  tail: false,
                                                },
                                                {
                                                  type: "TemplateElement",
                                                  start: 1304,
                                                  end: 1305,
                                                  value: {
                                                    raw: "!",
                                                    cooked: "!",
                                                  },
                                                  tail: true,
                                                },
                                              ],
                                            },
                                          ],
                                          optional: false,
                                        },
                                      },
                                      {
                                        type: "ExpressionStatement",
                                        start: 1325,
                                        end: 1339,
                                        expression: {
                                          type: "CallExpression",
                                          start: 1325,
                                          end: 1338,
                                          callee: {
                                            type: "Identifier",
                                            start: 1325,
                                            end: 1332,
                                            name: "resolve",
                                          },
                                          arguments: [
                                            {
                                              type: "Literal",
                                              start: 1333,
                                              end: 1337,
                                              value: null,
                                              raw: "null",
                                            },
                                          ],
                                          optional: false,
                                        },
                                      },
                                    ],
                                  },
                                },
                              ],
                            },
                          },
                        },
                      },
                      {
                        type: "ExpressionStatement",
                        start: 1373,
                        end: 1503,
                        expression: {
                          type: "AssignmentExpression",
                          start: 1373,
                          end: 1502,
                          operator: "=",
                          left: {
                            type: "MemberExpression",
                            start: 1373,
                            end: 1388,
                            object: {
                              type: "Identifier",
                              start: 1373,
                              end: 1380,
                              name: "request",
                            },
                            property: {
                              type: "Identifier",
                              start: 1381,
                              end: 1388,
                              name: "onerror",
                            },
                            computed: false,
                            optional: false,
                          },
                          right: {
                            type: "ArrowFunctionExpression",
                            start: 1391,
                            end: 1502,
                            id: null,
                            expression: false,
                            generator: false,
                            async: false,
                            params: [
                              {
                                type: "Identifier",
                                start: 1392,
                                end: 1397,
                                name: "error",
                              },
                            ],
                            body: {
                              type: "BlockStatement",
                              start: 1402,
                              end: 1502,
                              body: [
                                {
                                  type: "ExpressionStatement",
                                  start: 1416,
                                  end: 1465,
                                  expression: {
                                    type: "CallExpression",
                                    start: 1416,
                                    end: 1464,
                                    callee: {
                                      type: "MemberExpression",
                                      start: 1416,
                                      end: 1429,
                                      object: {
                                        type: "Identifier",
                                        start: 1416,
                                        end: 1423,
                                        name: "console",
                                      },
                                      property: {
                                        type: "Identifier",
                                        start: 1424,
                                        end: 1429,
                                        name: "error",
                                      },
                                      computed: false,
                                      optional: false,
                                    },
                                    arguments: [
                                      {
                                        type: "Literal",
                                        start: 1430,
                                        end: 1456,
                                        value: "Error getting document: ",
                                        raw: '"Error getting document: "',
                                      },
                                      {
                                        type: "Identifier",
                                        start: 1458,
                                        end: 1463,
                                        name: "error",
                                      },
                                    ],
                                    optional: false,
                                  },
                                },
                                {
                                  type: "ExpressionStatement",
                                  start: 1478,
                                  end: 1492,
                                  expression: {
                                    type: "CallExpression",
                                    start: 1478,
                                    end: 1491,
                                    callee: {
                                      type: "Identifier",
                                      start: 1478,
                                      end: 1484,
                                      name: "reject",
                                    },
                                    arguments: [
                                      {
                                        type: "Identifier",
                                        start: 1485,
                                        end: 1490,
                                        name: "error",
                                      },
                                    ],
                                    optional: false,
                                  },
                                },
                              ],
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      type: "FunctionDeclaration",
      start: 1514,
      end: 2040,
      id: {
        type: "Identifier",
        start: 1529,
        end: 1552,
        name: "updateDocumentIndexedDB",
      },
      expression: false,
      generator: false,
      async: true,
      params: [
        {
          type: "Identifier",
          start: 1553,
          end: 1559,
          name: "dbName",
        },
        {
          type: "Identifier",
          start: 1561,
          end: 1575,
          name: "collectionName",
        },
        {
          type: "Identifier",
          start: 1577,
          end: 1582,
          name: "docId",
        },
        {
          type: "Identifier",
          start: 1584,
          end: 1588,
          name: "data",
        },
      ],
      body: {
        type: "BlockStatement",
        start: 1590,
        end: 2040,
        body: [
          {
            type: "VariableDeclaration",
            start: 1596,
            end: 1676,
            declarations: [
              {
                type: "VariableDeclarator",
                start: 1602,
                end: 1675,
                id: {
                  type: "Identifier",
                  start: 1602,
                  end: 1614,
                  name: "existingData",
                },
                init: {
                  type: "AwaitExpression",
                  start: 1617,
                  end: 1675,
                  argument: {
                    type: "CallExpression",
                    start: 1623,
                    end: 1675,
                    callee: {
                      type: "Identifier",
                      start: 1623,
                      end: 1644,
                      name: "readDocumentIndexedDB",
                    },
                    arguments: [
                      {
                        type: "Identifier",
                        start: 1645,
                        end: 1651,
                        name: "dbName",
                      },
                      {
                        type: "Identifier",
                        start: 1653,
                        end: 1667,
                        name: "collectionName",
                      },
                      {
                        type: "Identifier",
                        start: 1669,
                        end: 1674,
                        name: "docId",
                      },
                    ],
                    optional: false,
                  },
                },
              },
            ],
            kind: "const",
          },
          {
            type: "IfStatement",
            start: 1681,
            end: 1814,
            test: {
              type: "UnaryExpression",
              start: 1685,
              end: 1698,
              operator: "!",
              prefix: true,
              argument: {
                type: "Identifier",
                start: 1686,
                end: 1698,
                name: "existingData",
              },
            },
            consequent: {
              type: "BlockStatement",
              start: 1700,
              end: 1814,
              body: [
                {
                  type: "ExpressionStatement",
                  start: 1710,
                  end: 1792,
                  expression: {
                    type: "CallExpression",
                    start: 1710,
                    end: 1791,
                    callee: {
                      type: "MemberExpression",
                      start: 1710,
                      end: 1723,
                      object: {
                        type: "Identifier",
                        start: 1710,
                        end: 1717,
                        name: "console",
                      },
                      property: {
                        type: "Identifier",
                        start: 1718,
                        end: 1723,
                        name: "error",
                      },
                      computed: false,
                      optional: false,
                    },
                    arguments: [
                      {
                        type: "TemplateLiteral",
                        start: 1724,
                        end: 1790,
                        expressions: [
                          {
                            type: "Identifier",
                            start: 1736,
                            end: 1741,
                            name: "docId",
                          },
                          {
                            type: "Identifier",
                            start: 1774,
                            end: 1788,
                            name: "collectionName",
                          },
                        ],
                        quasis: [
                          {
                            type: "TemplateElement",
                            start: 1725,
                            end: 1734,
                            value: {
                              raw: "Document ",
                              cooked: "Document ",
                            },
                            tail: false,
                          },
                          {
                            type: "TemplateElement",
                            start: 1742,
                            end: 1772,
                            value: {
                              raw: " does not exist in collection ",
                              cooked: " does not exist in collection ",
                            },
                            tail: false,
                          },
                          {
                            type: "TemplateElement",
                            start: 1789,
                            end: 1789,
                            value: {
                              raw: "",
                              cooked: "",
                            },
                            tail: true,
                          },
                        ],
                      },
                    ],
                    optional: false,
                  },
                },
                {
                  type: "ReturnStatement",
                  start: 1801,
                  end: 1808,
                  argument: null,
                },
              ],
            },
            alternate: null,
          },
          {
            type: "VariableDeclaration",
            start: 1820,
            end: 1869,
            declarations: [
              {
                type: "VariableDeclarator",
                start: 1826,
                end: 1868,
                id: {
                  type: "Identifier",
                  start: 1826,
                  end: 1837,
                  name: "updatedData",
                },
                init: {
                  type: "ObjectExpression",
                  start: 1840,
                  end: 1868,
                  properties: [
                    {
                      type: "SpreadElement",
                      start: 1842,
                      end: 1857,
                      argument: {
                        type: "Identifier",
                        start: 1845,
                        end: 1857,
                        name: "existingData",
                      },
                    },
                    {
                      type: "SpreadElement",
                      start: 1859,
                      end: 1866,
                      argument: {
                        type: "Identifier",
                        start: 1862,
                        end: 1866,
                        name: "data",
                      },
                    },
                  ],
                },
              },
            ],
            kind: "const",
          },
          {
            type: "ExpressionStatement",
            start: 1874,
            end: 1947,
            expression: {
              type: "AwaitExpression",
              start: 1874,
              end: 1946,
              argument: {
                type: "CallExpression",
                start: 1880,
                end: 1946,
                callee: {
                  type: "Identifier",
                  start: 1880,
                  end: 1902,
                  name: "writeDocumentIndexedDB",
                },
                arguments: [
                  {
                    type: "Identifier",
                    start: 1903,
                    end: 1909,
                    name: "dbName",
                  },
                  {
                    type: "Identifier",
                    start: 1911,
                    end: 1925,
                    name: "collectionName",
                  },
                  {
                    type: "Identifier",
                    start: 1927,
                    end: 1932,
                    name: "docId",
                  },
                  {
                    type: "Identifier",
                    start: 1934,
                    end: 1945,
                    name: "updatedData",
                  },
                ],
                optional: false,
              },
            },
          },
          {
            type: "ExpressionStatement",
            start: 1952,
            end: 2038,
            expression: {
              type: "CallExpression",
              start: 1952,
              end: 2037,
              callee: {
                type: "MemberExpression",
                start: 1952,
                end: 1963,
                object: {
                  type: "Identifier",
                  start: 1952,
                  end: 1959,
                  name: "console",
                },
                property: {
                  type: "Identifier",
                  start: 1960,
                  end: 1963,
                  name: "log",
                },
                computed: false,
                optional: false,
              },
              arguments: [
                {
                  type: "TemplateLiteral",
                  start: 1964,
                  end: 2036,
                  expressions: [
                    {
                      type: "Identifier",
                      start: 1976,
                      end: 1981,
                      name: "docId",
                    },
                    {
                      type: "Identifier",
                      start: 2020,
                      end: 2034,
                      name: "collectionName",
                    },
                  ],
                  quasis: [
                    {
                      type: "TemplateElement",
                      start: 1965,
                      end: 1974,
                      value: {
                        raw: "Document ",
                        cooked: "Document ",
                      },
                      tail: false,
                    },
                    {
                      type: "TemplateElement",
                      start: 1982,
                      end: 2018,
                      value: {
                        raw: " updated successfully in collection ",
                        cooked: " updated successfully in collection ",
                      },
                      tail: false,
                    },
                    {
                      type: "TemplateElement",
                      start: 2035,
                      end: 2035,
                      value: {
                        raw: "",
                        cooked: "",
                      },
                      tail: true,
                    },
                  ],
                },
              ],
              optional: false,
            },
          },
        ],
      },
    },
    {
      type: "FunctionDeclaration",
      start: 2042,
      end: 2687,
      id: {
        type: "Identifier",
        start: 2057,
        end: 2080,
        name: "deleteDocumentIndexedDB",
      },
      expression: false,
      generator: false,
      async: true,
      params: [
        {
          type: "Identifier",
          start: 2081,
          end: 2087,
          name: "dbName",
        },
        {
          type: "Identifier",
          start: 2089,
          end: 2103,
          name: "collectionName",
        },
        {
          type: "Identifier",
          start: 2105,
          end: 2110,
          name: "docId",
        },
      ],
      body: {
        type: "BlockStatement",
        start: 2112,
        end: 2687,
        body: [
          {
            type: "VariableDeclaration",
            start: 2118,
            end: 2156,
            declarations: [
              {
                type: "VariableDeclarator",
                start: 2124,
                end: 2155,
                id: {
                  type: "Identifier",
                  start: 2124,
                  end: 2126,
                  name: "db",
                },
                init: {
                  type: "AwaitExpression",
                  start: 2129,
                  end: 2155,
                  argument: {
                    type: "CallExpression",
                    start: 2135,
                    end: 2155,
                    callee: {
                      type: "Identifier",
                      start: 2135,
                      end: 2147,
                      name: "openDatabase",
                    },
                    arguments: [
                      {
                        type: "Identifier",
                        start: 2148,
                        end: 2154,
                        name: "dbName",
                      },
                    ],
                    optional: false,
                  },
                },
              },
            ],
            kind: "const",
          },
          {
            type: "VariableDeclaration",
            start: 2161,
            end: 2225,
            declarations: [
              {
                type: "VariableDeclarator",
                start: 2167,
                end: 2224,
                id: {
                  type: "Identifier",
                  start: 2167,
                  end: 2178,
                  name: "transaction",
                },
                init: {
                  type: "CallExpression",
                  start: 2181,
                  end: 2224,
                  callee: {
                    type: "MemberExpression",
                    start: 2181,
                    end: 2195,
                    object: {
                      type: "Identifier",
                      start: 2181,
                      end: 2183,
                      name: "db",
                    },
                    property: {
                      type: "Identifier",
                      start: 2184,
                      end: 2195,
                      name: "transaction",
                    },
                    computed: false,
                    optional: false,
                  },
                  arguments: [
                    {
                      type: "Identifier",
                      start: 2196,
                      end: 2210,
                      name: "collectionName",
                    },
                    {
                      type: "Literal",
                      start: 2212,
                      end: 2223,
                      value: "readwrite",
                      raw: "'readwrite'",
                    },
                  ],
                  optional: false,
                },
              },
            ],
            kind: "const",
          },
          {
            type: "VariableDeclaration",
            start: 2230,
            end: 2284,
            declarations: [
              {
                type: "VariableDeclarator",
                start: 2236,
                end: 2283,
                id: {
                  type: "Identifier",
                  start: 2236,
                  end: 2241,
                  name: "store",
                },
                init: {
                  type: "CallExpression",
                  start: 2244,
                  end: 2283,
                  callee: {
                    type: "MemberExpression",
                    start: 2244,
                    end: 2267,
                    object: {
                      type: "Identifier",
                      start: 2244,
                      end: 2255,
                      name: "transaction",
                    },
                    property: {
                      type: "Identifier",
                      start: 2256,
                      end: 2267,
                      name: "objectStore",
                    },
                    computed: false,
                    optional: false,
                  },
                  arguments: [
                    {
                      type: "Identifier",
                      start: 2268,
                      end: 2282,
                      name: "collectionName",
                    },
                  ],
                  optional: false,
                },
              },
            ],
            kind: "const",
          },
          {
            type: "ExpressionStatement",
            start: 2290,
            end: 2310,
            expression: {
              type: "CallExpression",
              start: 2290,
              end: 2309,
              callee: {
                type: "MemberExpression",
                start: 2290,
                end: 2302,
                object: {
                  type: "Identifier",
                  start: 2290,
                  end: 2295,
                  name: "store",
                },
                property: {
                  type: "Identifier",
                  start: 2296,
                  end: 2302,
                  name: "delete",
                },
                computed: false,
                optional: false,
              },
              arguments: [
                {
                  type: "Identifier",
                  start: 2303,
                  end: 2308,
                  name: "docId",
                },
              ],
              optional: false,
            },
          },
          {
            type: "ReturnStatement",
            start: 2316,
            end: 2685,
            argument: {
              type: "NewExpression",
              start: 2323,
              end: 2684,
              callee: {
                type: "Identifier",
                start: 2327,
                end: 2334,
                name: "Promise",
              },
              arguments: [
                {
                  type: "ArrowFunctionExpression",
                  start: 2335,
                  end: 2683,
                  id: null,
                  expression: false,
                  generator: false,
                  async: false,
                  params: [
                    {
                      type: "Identifier",
                      start: 2336,
                      end: 2343,
                      name: "resolve",
                    },
                    {
                      type: "Identifier",
                      start: 2345,
                      end: 2351,
                      name: "reject",
                    },
                  ],
                  body: {
                    type: "BlockStatement",
                    start: 2356,
                    end: 2683,
                    body: [
                      {
                        type: "ExpressionStatement",
                        start: 2366,
                        end: 2533,
                        expression: {
                          type: "AssignmentExpression",
                          start: 2366,
                          end: 2532,
                          operator: "=",
                          left: {
                            type: "MemberExpression",
                            start: 2366,
                            end: 2388,
                            object: {
                              type: "Identifier",
                              start: 2366,
                              end: 2377,
                              name: "transaction",
                            },
                            property: {
                              type: "Identifier",
                              start: 2378,
                              end: 2388,
                              name: "oncomplete",
                            },
                            computed: false,
                            optional: false,
                          },
                          right: {
                            type: "ArrowFunctionExpression",
                            start: 2391,
                            end: 2532,
                            id: null,
                            expression: false,
                            generator: false,
                            async: false,
                            params: [],
                            body: {
                              type: "BlockStatement",
                              start: 2397,
                              end: 2532,
                              body: [
                                {
                                  type: "ExpressionStatement",
                                  start: 2411,
                                  end: 2499,
                                  expression: {
                                    type: "CallExpression",
                                    start: 2411,
                                    end: 2498,
                                    callee: {
                                      type: "MemberExpression",
                                      start: 2411,
                                      end: 2422,
                                      object: {
                                        type: "Identifier",
                                        start: 2411,
                                        end: 2418,
                                        name: "console",
                                      },
                                      property: {
                                        type: "Identifier",
                                        start: 2419,
                                        end: 2422,
                                        name: "log",
                                      },
                                      computed: false,
                                      optional: false,
                                    },
                                    arguments: [
                                      {
                                        type: "TemplateLiteral",
                                        start: 2423,
                                        end: 2497,
                                        expressions: [
                                          {
                                            type: "Identifier",
                                            start: 2435,
                                            end: 2440,
                                            name: "docId",
                                          },
                                          {
                                            type: "Identifier",
                                            start: 2481,
                                            end: 2495,
                                            name: "collectionName",
                                          },
                                        ],
                                        quasis: [
                                          {
                                            type: "TemplateElement",
                                            start: 2424,
                                            end: 2433,
                                            value: {
                                              raw: "Document ",
                                              cooked: "Document ",
                                            },
                                            tail: false,
                                          },
                                          {
                                            type: "TemplateElement",
                                            start: 2441,
                                            end: 2479,
                                            value: {
                                              raw: " deleted successfully from collection ",
                                              cooked:
                                                " deleted successfully from collection ",
                                            },
                                            tail: false,
                                          },
                                          {
                                            type: "TemplateElement",
                                            start: 2496,
                                            end: 2496,
                                            value: {
                                              raw: "",
                                              cooked: "",
                                            },
                                            tail: true,
                                          },
                                        ],
                                      },
                                    ],
                                    optional: false,
                                  },
                                },
                                {
                                  type: "ExpressionStatement",
                                  start: 2512,
                                  end: 2522,
                                  expression: {
                                    type: "CallExpression",
                                    start: 2512,
                                    end: 2521,
                                    callee: {
                                      type: "Identifier",
                                      start: 2512,
                                      end: 2519,
                                      name: "resolve",
                                    },
                                    arguments: [],
                                    optional: false,
                                  },
                                },
                              ],
                            },
                          },
                        },
                      },
                      {
                        type: "ExpressionStatement",
                        start: 2542,
                        end: 2677,
                        expression: {
                          type: "AssignmentExpression",
                          start: 2542,
                          end: 2676,
                          operator: "=",
                          left: {
                            type: "MemberExpression",
                            start: 2542,
                            end: 2561,
                            object: {
                              type: "Identifier",
                              start: 2542,
                              end: 2553,
                              name: "transaction",
                            },
                            property: {
                              type: "Identifier",
                              start: 2554,
                              end: 2561,
                              name: "onerror",
                            },
                            computed: false,
                            optional: false,
                          },
                          right: {
                            type: "ArrowFunctionExpression",
                            start: 2564,
                            end: 2676,
                            id: null,
                            expression: false,
                            generator: false,
                            async: false,
                            params: [
                              {
                                type: "Identifier",
                                start: 2565,
                                end: 2570,
                                name: "error",
                              },
                            ],
                            body: {
                              type: "BlockStatement",
                              start: 2575,
                              end: 2676,
                              body: [
                                {
                                  type: "ExpressionStatement",
                                  start: 2589,
                                  end: 2639,
                                  expression: {
                                    type: "CallExpression",
                                    start: 2589,
                                    end: 2638,
                                    callee: {
                                      type: "MemberExpression",
                                      start: 2589,
                                      end: 2602,
                                      object: {
                                        type: "Identifier",
                                        start: 2589,
                                        end: 2596,
                                        name: "console",
                                      },
                                      property: {
                                        type: "Identifier",
                                        start: 2597,
                                        end: 2602,
                                        name: "error",
                                      },
                                      computed: false,
                                      optional: false,
                                    },
                                    arguments: [
                                      {
                                        type: "Literal",
                                        start: 2603,
                                        end: 2630,
                                        value: "Error deleting document: ",
                                        raw: '"Error deleting document: "',
                                      },
                                      {
                                        type: "Identifier",
                                        start: 2632,
                                        end: 2637,
                                        name: "error",
                                      },
                                    ],
                                    optional: false,
                                  },
                                },
                                {
                                  type: "ExpressionStatement",
                                  start: 2652,
                                  end: 2666,
                                  expression: {
                                    type: "CallExpression",
                                    start: 2652,
                                    end: 2665,
                                    callee: {
                                      type: "Identifier",
                                      start: 2652,
                                      end: 2658,
                                      name: "reject",
                                    },
                                    arguments: [
                                      {
                                        type: "Identifier",
                                        start: 2659,
                                        end: 2664,
                                        name: "error",
                                      },
                                    ],
                                    optional: false,
                                  },
                                },
                              ],
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
  sourceType: "module",
};
const firestoreCode = compileToFirestore(ast); // Pass the AST object here
console.log(firestoreCode);
