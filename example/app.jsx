
const constraints = {
  // set user env var
  height: 720,
  width: 1280,
  frameRate: 24,
  facingMode: "user"
};

const testStorage = {
  /** Sets blob properties. This will be called only before the first call of storeChunk() after construction or reset(). */
  setBlobProperties(blobProperties) { console.log("setBlobProperties:", blobProperties) },

  /** Handle recorded video chunk. */
  storeChunk(chunk) { console.log("storeChunk:", chunk) },

  /** Informs this storage that the last chunk has been provided. */
  stop() { console.log("stop") },

  /** Resets this storage so that a new video can be recorded. */
  reset() { console.log("reset") },

  /** Gets the URL where the video is stored. */
  getUrl() { console.log("getUrl"); return "testUrl" },

  /** If this storage stores all chunks in a merged Blob, returns it; otherwise returns undefined.*/
  getBlob() { console.log("getBlob") },
}

ReactDOM.render(
  <exports.ReactMediaRecorder
    video={constraints} videoStorage={testStorage}
    render={({status, startRecording, stopRecording, previewStream}) => (
      <div className="text-center">
        <div >
          {/* <p >{status}</p> */}
          <button
            style={{ height: "50px" }}
            className=" btn btn-outline-primary record_btn m-1"
            onClick={startRecording}
          >
            Start Recording
          </button>
          <button   style={{ height: "50px" }}   className=" btn btn-outline-primary record_btn m-1"   onClick={stopRecording} >
            Stop Recording
          </button>
        </div>
      </div>
    )}/>,
  document.getElementById('content'));
