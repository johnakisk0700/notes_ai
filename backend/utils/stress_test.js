import axios from "axios";

async function sendConcurrentRequests(url, data) {
  //   const numRequests = Math.floor(Math.random() * 901) + 100; // Random number between 100 and 1000
  const numRequests = 10000;
  try {
    const promises = Array.from({ length: numRequests }, () => {
      return axios.post(url, data); // Return the promise from axios.post
    });

    const results = await Promise.all(promises); // Wait for all requests to complete

    console.log(`Sent ${numRequests} requests.`);
    console.log(
      "Results:",
      results.map((res) => res.data)
    ); // Process results if needed

    return results; // Return the array of results
  } catch (error) {
    console.error(`Error sending requests:`, error);
    throw error; // Re-throw the error to be handled by the caller
  }
}

// Example usage:
const apiUrl = "http://localhost:5000/get-transcription"; // Replace with your actual URL
const requestData = {
  /* Your request payload */
}; // Replace with the data you want to send

sendConcurrentRequests(apiUrl, requestData)
  .then((results) => {
    console.log("All requests completed successfully!");
    // Further processing of 'results' if needed.
  })
  .catch((error) => {
    console.error("An error occurred during the requests:", error);
    // Handle the error appropriately.
  });

// More robust error handling example (using Promise.allSettled):
async function sendConcurrentRequestsRobust(url, data) {
  const numRequests = Math.floor(Math.random() * 901) + 100;

  try {
    const promises = Array.from({ length: numRequests }, () =>
      axios.post(url, data)
    );

    const results = await Promise.allSettled(promises); // Use Promise.allSettled

    const successes = results.filter((res) => res.status === "fulfilled");
    const failures = results.filter((res) => res.status === "rejected");

    console.log(`Sent ${numRequests} requests.`);
    console.log(`Successful requests: ${successes.length}`);
    console.log(`Failed requests: ${failures.length}`);

    if (failures.length > 0) {
      console.error(
        "Some requests failed:",
        failures.map((f) => f.reason)
      ); // Log reasons for failures
    }
    return results; // Return all results (fulfilled and rejected)
  } catch (error) {
    console.error(`Error sending requests:`, error);
    throw error;
  }
}

// // Example usage of the robust version:
// sendConcurrentRequestsRobust(apiUrl, requestData)
//   .then((results) => {
//     // Process results.  You'll want to check the status of each result
//     // because some might have failed.
//     console.log("All requests settled (some might have failed).");
//   })
//   .catch((error) => {
//     console.error("A general error occurred:", error);
//   });
