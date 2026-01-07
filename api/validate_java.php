<?php
header('Content-Type: application/json; charset=utf-8');

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

$format = $data['format'] ?? '';
$text   = $data['text'] ?? '';

$javaUrl = 'http://localhost:8082/validate';

$payload = json_encode([
  "format" => $format,
  "text" => $text
]);

$ch = curl_init($javaUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);

$response = curl_exec($ch);

if ($response === false) {
  http_response_code(500);
  echo json_encode([
    "ok" => false,
    "errors" => ["Java validator service is not reachable (localhost:8082)."],
    "details" => curl_error($ch)
  ]);
  curl_close($ch);
  exit;
}
curl_close($ch);

$java = json_decode($response, true);
if (!is_array($java) || !array_key_exists('ok', $java)) {
  http_response_code(500);
  echo json_encode([
    "ok" => false,
    "errors" => ["Bad Java response."],
    "raw" => $response
  ]);
  exit;
}

echo json_encode($java);
