<?php
header('Content-Type: application/json; charset=utf-8');

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

$inputString = $data['inputString'] ?? '';
$settingsString = $data['settingsString'] ?? '';

$rpcUrl = 'http://localhost:3001/rpc';

$payload = json_encode([
  "jsonrpc" => "2.0",
  "id" => 1,
  "method" => "convert",
  "params" => [
    "inputString" => $inputString,
    "settingsString" => $settingsString
  ]
]);

$ch = curl_init($rpcUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);

$response = curl_exec($ch);

if ($response === false) {
  http_response_code(500);
  echo json_encode([
    "ok" => false,
    "error" => "RPC call failed. Is the Node service running on localhost:3001?",
    "details" => curl_error($ch)
  ]);
  curl_close($ch);
  exit;
}

curl_close($ch);

$rpc = json_decode($response, true);
if (!isset($rpc['result']['output'])) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "Bad RPC response", "rpc" => $rpc]);
  exit;
}

echo json_encode([
  "ok" => true,
  "debug_rpc" => $rpc,  // <-- временно за дебъг
  "output" => $rpc['result']['output']
]);
exit;
