import crypto from 'crypto';

const PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0zEV2u/PovbsWn4noi9prcsww8zXXG4OiERW3reIPVt753XW
ZMb2NYDNvTRp2fxCNN3caZmBpoJe5erUehIwhJJMd04yey0yzvIrVHe+iluNWJ13
6G8JDl80ivtDgoxxE4x8HVXLyC2sWhPzurL1Xk1je74C1k46H9j9LZi0NRkHy3cA
ABIcXI8GzFTLdkWD2MOkv8OTNB49WqUUCm1JPC3lLgrXAxFyUuCZQfkFEg9bWxyp
nQ8RuG+f00iUXR/w7JBBQ1+4EKBN1tQSpYeKM8QhgKwc8IGF7QyNEjiw/scYGO1A
1Djv8pMBasvYsVD+oWX9rnb1fbMhlEjYIfU74wIDAQABAoIBAGM/yyST1MGiR1sT
tG6M1548QlOSHZerhRrW+vg5ykYDi0wwXawIsMZeHNIRIrm1yitsJFxgLsTgudZV
MLuZdsGmu1bKIgEvMZR9zI0qpRoCgn+lqSdLnzbo2RmDkat1cuKb/+wNWPJfPIMs
ozsXRSanOdx6ZHzwUHKNGBZokC/vE+VSydHbeUy3Txi4+75ZMTOCL/r/hur0hWoG
Sv7c/5sDWGhRFFV1CD/03pESn8Gu4qQW20eyai+WeebeIUjlV802chPdrn8ztIMb
Tn7K1mcrkPQlty3YJMS3KJt0idE5fzsw3KmANbJc4xjhN/FPNHz45Xk7O0g4qNmA
39g+LWECgYEA6UuMyFjsCLBWJMOj7b5Wa/JgpGAmS98Lnl501buvLi1xtYIIPmPh
78Ki7EaGu5YpVvx4lPQFd6HZaZu/KZLxYmtsprxA6MShOwKd4/yor9srgkxm1z53
AA2UrNbcN14TmKmi886dv5BsuhOCzgPXWEITKZiXGg2mRGId2z1OsnMCgYEA577W
zKoSdZYGMrwHbmbo1pQpXt7f4hBQBLXr7V9svG0CflsQcmHhwQtl8VtbRcyaLzOQ
cd2yQKSqdsXnW43BzBVH8wwuICxVnrqlRD63OmpmkPW50d87BKPH2/RVly3Aop0Q
PBiCN94iV+I5swYN9Bq0g+P/MGHUN6uXX3a1RNECgYEAjcq1Ti99hepm8QFXaO/+
Zq1xv3YQ0JxH24FdUWo5Fr/YFJFroT/j2m1ZyHE1Al5J0eyw/RczG3rrQRzAGuyM
eV0BNHXGnbKkq9DzVdYCUJ/M2ezFtJzqhsW6TzJntd8f2fGAcN5rUjrdWlrxbXU4
NRQzwVxUuikBnR5lNxMT+bECgYEAyYeMBC9iHh95BGW/kKKtmOz/jSEEUPMeovoR
UTvKs5GYuYk3pEC6scXXwSxRE0H6U1HkKyFAAjcwhllT+Kot/ewDxbix5Aip7H8j
eVWQwZwF1cna7kfSaxaClyTDydRf0QoFND2cADmMZCC3TJfXSpBuqsN7B/gLNN5j
pQD2YgECgYBjVaVDh+9BEIwGG5SC1eUPA3SbAW7zTJsDlH5ZjCR+0m0qP+lXQ8RK
E3Ikd/ani5LFtSUwzOjEdOkELuGlaEVByZnhiu0aY26OQRc0GCUTiaCkrOhy+WQI
MRzMRdDBDtp3suYiqov3yMMsEoudujLEAP/Uw+Fb3QejAsZpZx7kGg==
-----END RSA PRIVATE KEY-----
`;

export const decryptRequest = (body, privatePem = PRIVATE_KEY) => {
    const { encrypted_aes_key, encrypted_flow_data, initial_vector } = body;

    // Decrypt the AES key created by the client
    const decryptedAesKey = crypto.privateDecrypt(
        {
            key: crypto.createPrivateKey(privatePem),
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256',
        },
        Buffer.from(encrypted_aes_key, 'base64')
    );

    // Decrypt the Flow data
    const flowDataBuffer = Buffer.from(encrypted_flow_data, 'base64');
    const initialVectorBuffer = Buffer.from(initial_vector, 'base64');

    const TAG_LENGTH = 16;
    const encryptedFlowDataBody = flowDataBuffer.subarray(0, -TAG_LENGTH);
    const encryptedFlowDataTag = flowDataBuffer.subarray(-TAG_LENGTH);

    const decipher = crypto.createDecipheriv(
        'aes-128-gcm',
        decryptedAesKey,
        initialVectorBuffer
    );
    decipher.setAuthTag(encryptedFlowDataTag);

    const decryptedJSONString = Buffer.concat([
        decipher.update(encryptedFlowDataBody),
        decipher.final(),
    ]).toString('utf-8');

    return {
        decryptedBody: JSON.parse(decryptedJSONString),
        aesKeyBuffer: decryptedAesKey,
        initialVectorBuffer,
    };
};

export const encryptResponse = (response, aesKeyBuffer, initialVectorBuffer) => {
    // Flip the initialization vector
    const flipped_iv = new Uint8Array(initialVectorBuffer.length);
    for (let i = 0; i < initialVectorBuffer.length; i++) {
        flipped_iv[i] = initialVectorBuffer[i] ^ 0xff;
    }
    // Encrypt the response data
    const cipher = crypto.createCipheriv(
        'aes-128-gcm',
        aesKeyBuffer,
        flipped_iv
    );
    return Buffer.concat([
        cipher.update(JSON.stringify(response), 'utf-8'),
        cipher.final(),
        cipher.getAuthTag(),
    ]).toString('base64');
};
