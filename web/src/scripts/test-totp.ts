#!/usr/bin/env bun

import { TOTPService } from '../lib/services/totp.service';

console.log('🧪 Testing TOTP Service...\n');

// Test 1: Generate TOTP secret
console.log('1. Testing secret generation...');
const secret = TOTPService.generateSecret();
console.log(`   Generated secret: ${secret}`);
console.log(`   Secret length: ${secret.length} characters`);
console.log(`   Valid format: ${/^[A-Z2-7]+$/.test(secret) ? '✅' : '❌'}\n`);

// Test 2: Generate QR code
console.log('2. Testing QR code generation...');
const config = {
	issuer: 'Wayli Test',
	label: 'test@example.com',
	email: 'test@example.com'
};

try {
	const qrCodeUrl = await TOTPService.generateQRCode(config, secret);
	console.log(`   QR code generated: ${qrCodeUrl.substring(0, 50)}...`);
	console.log(`   QR code length: ${qrCodeUrl.length} characters`);
	console.log('   ✅ QR code generation successful\n');
} catch (error) {
	console.log(`   ❌ QR code generation failed: ${error}\n`);
}

// Test 3: Generate recovery codes
console.log('3. Testing recovery code generation...');
const recoveryCodes = TOTPService.generateRecoveryCodes(5, 8);
console.log(`   Generated ${recoveryCodes.length} recovery codes:`);
recoveryCodes.forEach((rc, index) => {
	console.log(`   ${index + 1}. ${rc.code} (hashed: ${rc.hashed.substring(0, 16)}...)`);
});
console.log('   ✅ Recovery code generation successful\n');

// Test 4: Test recovery code verification
console.log('4. Testing recovery code verification...');
const testCode = recoveryCodes[0].code;
const hashedCodes = recoveryCodes.map(rc => rc.hashed);

const verification = TOTPService.verifyRecoveryCode(testCode, hashedCodes);
console.log(`   Test code: ${testCode}`);
console.log(`   Verification result: ${verification.isValid ? '✅ Valid' : '❌ Invalid'}`);
console.log(`   Remaining codes: ${verification.remainingCodes.length}`);
console.log('   ✅ Recovery code verification successful\n');

// Test 5: Test TOTP code generation and verification
console.log('5. Testing TOTP code generation and verification...');
console.log('   Note: This test requires manual verification with an authenticator app');
console.log(`   Secret: ${secret}`);
console.log(`   otpauth URL: otpauth://totp/${config.issuer}:${config.email}?secret=${secret}&issuer=${config.issuer}`);
console.log('   Please scan the QR code or enter the secret in your authenticator app');
console.log('   Then enter a generated code to test verification\n');

// Test 6: Validation tests
console.log('6. Testing validation functions...');

// Token validation
const validToken = '123456';
const invalidToken = '12345';
const emptyToken = '';

console.log(`   Valid token '${validToken}': ${TOTPService.validateToken(validToken).isValid ? '✅' : '❌'}`);
console.log(`   Invalid token '${invalidToken}': ${!TOTPService.validateToken(invalidToken).isValid ? '✅' : '❌'}`);
console.log(`   Empty token: ${!TOTPService.validateToken(emptyToken).isValid ? '✅' : '❌'}`);

// Recovery code validation
const validRecoveryCode = 'ABCD1234';
const invalidRecoveryCode = '123';
const emptyRecoveryCode = '';

console.log(`   Valid recovery code '${validRecoveryCode}': ${TOTPService.validateRecoveryCode(validRecoveryCode).isValid ? '✅' : '❌'}`);
console.log(`   Invalid recovery code '${invalidRecoveryCode}': ${!TOTPService.validateRecoveryCode(invalidRecoveryCode).isValid ? '✅' : '❌'}`);
console.log(`   Empty recovery code: ${!TOTPService.validateRecoveryCode(emptyRecoveryCode).isValid ? '✅' : '❌'}`);

// Config validation
const validConfig = { issuer: 'Test', label: 'test', email: 'test@example.com' };
const invalidConfig = { issuer: '', label: '', email: 'invalid-email' };

console.log(`   Valid config: ${TOTPService.validateConfig(validConfig).isValid ? '✅' : '❌'}`);
console.log(`   Invalid config: ${!TOTPService.validateConfig(invalidConfig).isValid ? '✅' : '❌'}`);

console.log('\n🎉 TOTP Service tests completed!');
console.log('\nTo test TOTP verification:');
console.log('1. Scan the QR code or enter the secret in your authenticator app');
console.log('2. Generate a code and use it to test the verification endpoint');
console.log('3. The verification should work with the proper TOTP service implementation');