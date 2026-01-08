import { encryptResponse, decryptRequest } from "../utils/encryption.js";

function sendScreen({ screenName, screenData }, msgBody, res) {
  const { aesKeyBuffer, initialVectorBuffer, version } = msgBody; // msgBody here is the decrypted/processed object which contains keys

  const screen = {
    version: version || "3.0",
    screen: screenName,
  };

  if (screenData) {
    screen.data = screenData;
  }

  const encryptedResponse = encryptResponse(
    screen,
    aesKeyBuffer,
    initialVectorBuffer
  );

  return res.status(200).send(encryptedResponse);
}

const handleFlowRequest = (controllerFn) => (req, res) => {
  try {
    const { decryptedBody, aesKeyBuffer, initialVectorBuffer } = decryptRequest(req.body);

    // Check for Health Check (ping)
    if (decryptedBody.action === 'ping') {
      const healthCheckResponse = {
        version: "3.0",
        data: {
          status: "active"
        }
      };
      const encryptedResponse = encryptResponse(
        healthCheckResponse,
        aesKeyBuffer,
        initialVectorBuffer
      );
      return res.status(200).send(encryptedResponse);
    }

    // Pass the decrypted body and keys to the specific controller logic
    // The controller function should return { screenName, screenData }
    const result = controllerFn(decryptedBody);

    return sendScreen(result, { aesKeyBuffer, initialVectorBuffer, version: decryptedBody.version }, res);
  } catch (error) {
    console.error("Error in flow handling:", error);
    return res.status(500).send("Internal Server Error");
  }
};

const getFallbackDateData = () => {
  const currentDate = new Date();
  const minDate = currentDate.toISOString().split('T')[0];

  // Create new date for max to avoid mutation issues and ensure correct calculation
  const maxDateObj = new Date(currentDate);
  maxDateObj.setMonth(maxDateObj.getMonth() + 6);
  const maxDate = maxDateObj.toISOString().split('T')[0];

  return { minDate, maxDate };
};

const oneDayLeaveController = handleFlowRequest((decryptedBody) => {
  const screenName = "Request_Leave_One";
  console.log("One Day Leave Incoming Body:", JSON.stringify(decryptedBody));

  const screenData = {
    ...getFallbackDateData(),
    ...(decryptedBody.data || {})
  };

  console.log("One Day Leave Response Data:", JSON.stringify(screenData));
  return { screenName, screenData };
});

const manyDayLeaveController = handleFlowRequest((decryptedBody) => {
  const screenName = "Request_Leave_Many";
  console.log("Many Day Leave Incoming Body:", JSON.stringify(decryptedBody));

  const screenData = {
    ...getFallbackDateData(),
    ...(decryptedBody.data || {})
  };

  console.log("Many Day Leave Response Data:", JSON.stringify(screenData));
  return { screenName, screenData };
});

const editEmployeeController = handleFlowRequest((decryptedBody) => {
  const screenName = "Edit_Employee";
  const screenData = {
    data: {
      employeename: "Ram Sharms",
      employeeno: "918291849565"
    }
  };
  return { screenName, screenData };
});

const signUpController = handleFlowRequest((decryptedBody) => {
  const screenName = "Sign_Up";
  const screenData = {
    // ...
  };
  return { screenName, screenData };
});

export {
  oneDayLeaveController,
  manyDayLeaveController,
  editEmployeeController,
  signUpController,
};
