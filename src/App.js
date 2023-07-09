import logo from "./logo.svg";
import "./App.css";
import MicrophonePlot from "./MicrophonePlot";
import MicrophonePlotWS from "./MicrophonePlotWS";
import MicrophonePlotRTC from "./MicrophonePlotWRTC";

function App() {
  return (
    <div>
      {/* <h1>Corticom Real-time Test Prototype</h1> */}
      <MicrophonePlotRTC />
    </div>
  );
}

export default App;
