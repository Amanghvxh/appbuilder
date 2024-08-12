const acorn = require("acorn");
const jsx = require("acorn-jsx");
const acornTypeScript = require("acorn-typescript");
const YAML = require("yaml");

class AST {
  constructor() {
    this.parsers = {
      javascript: acorn.Parser.extend(jsx()),
      typescript: acorn.Parser.extend(acornTypeScript),
      yaml: (codeString) => YAML.parse(codeString),
      json: (codeString) => JSON.parse(codeString),
    };
  }

  generateAST(codeString, parserType = "javascript") {
    if (!codeString || typeof codeString !== "string") {
      throw new Error(
        `Error occurred in generate method of AST class, where the codeString is of type ${typeof codeString} and is required to be a string, and the codeString is ${
          codeString ? "not empty" : "empty"
        }`
      );
    }

    if (!this.parsers[parserType]) {
      throw new Error(`Parser type "${parserType}" is not supported.`);
    }

    try {
      const parser = this.parsers[parserType];
      const ast =
        parserType === "javascript" || parserType === "typescript"
          ? parser.parse(codeString, {
              ecmaVersion: "latest",
              sourceType: "module",
            })
          : parser(codeString);

      if (typeof ast !== "object") {
        throw new Error("Generated AST is not an object.");
      }
      return ast;
    } catch (error) {
      throw new Error(`Parsing error: ${error.message}`);
    }
  }
}

// Example JavaScript and JSX strings for testing
const jsCode = `
  function sum(a, b) {
    return a + b;
  }
  const result = sum(1, 2);
`;

const tsCode = `
  function add(a: number, b: number): number {
    return a + b;
  }
  const result = add(1, 2);
`;

const jsxCode = `
  function MyComponent() {
    return (
      <div>
        <h1>Hello, World!</h1>
        <p>This is a test component.</p>
      </div>
    );
  }
  const element = <MyComponent />;
`;

const yamlCode = `
  name: John Doe
  age: 30
  address:
    street: 123 Main St
    city: Anytown
`;

const jsonCode = `
{
  "name": "John Doe",
  "age": 30,
  "address": {
    "street": "123 Main St",
    "city": "Anytown"
  }
}
`;

const tailwindConfig = `
module.exports = {
  purge: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  darkMode: false, // or 'media' or 'class'
  theme: {
    extend: {},
  },
  variants: {
    extend: {},
  },
  plugins: [],
}
`;

// Create an instance of the AST class
const astInstance = new AST();

// Define test cases
const testCases = [
  {
    code: jsCode,
    description: "JavaScript function with variable declaration",
    parserType: "javascript",
  },
  {
    code: tsCode,
    description: "TypeScript function with type annotations",
    parserType: "typescript",
  },
  {
    code: jsxCode,
    description: "Basic JSX component",
    parserType: "javascript",
  },
  {
    code: yamlCode,
    description: "YAML configuration file",
    parserType: "yaml",
  },
  {
    code: jsonCode,
    description: "JSON configuration",
    parserType: "json",
  },
  {
    code: tailwindConfig,
    description: "TailwindCSS configuration file",
    parserType: "javascript",
  },
];

// Run tests
testCases.forEach(({ code, description, parserType }) => {
  try {
    const ast = astInstance.generateAST(code, parserType);
    console.log(`${description} - AST generated successfully.`);
    console.log(JSON.stringify(ast, null, 2)); // Print the AST for visual verification (optional)
  } catch (error) {
    console.error(`${description} - Error: ${error.message}`);
  }
});

// Additional tests for error handling
try {
  astInstance.generateAST(null);
} catch (error) {
  console.log("Error handling for null input passed.");
}

try {
  astInstance.generateAST(12345);
} catch (error) {
  console.log("Error handling for non-string input passed.");
}

try {
  astInstance.generateAST(jsCode, "unsupportedParser");
} catch (error) {
  console.log("Error handling for unsupported parser passed.");
}
