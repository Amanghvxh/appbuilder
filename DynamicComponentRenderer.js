// DynamicComponentRenderer.js
class DynamicComponentRenderer {
  constructor(rootElementId) {
    this.rootElementId = rootElementId;
  }

  render(componentString) {
    try {
      if (!componentString) {
        throw new Error("Component string cannot be empty.");
      }

      // Transform the component string into executable code
      const transformedCode = Babel.transform(componentString, {
        presets: ["react"],
      }).code;

      // Create a function to evaluate the transformed code and return the component
      const componentFunction = new Function(
        "React",
        "ReactDOM",
        `${transformedCode}; return App;`
      );

      // Get the component definition
      const Component = componentFunction(React, ReactDOM);

      // Render the component to the DOM
      ReactDOM.render(
        React.createElement(Component),
        document.getElementById(this.rootElementId)
      );
    } catch (error) {
      console.error("Error rendering component:", error);
      alert(
        "There was an error rendering the component. Please check your code and try again."
      );
    }
  }
}
