<?php
require_once __DIR__ . "/db.php";

if (!isset($_SESSION['uid'])) {
  http_response_code(401);
  echo json_encode(["ok" => false, "error" => "Not authenticated"]);
  exit;
}

$uid = intval($_SESSION['uid']);

$dotnetBase = "http://localhost:5278";
$url = $dotnetBase . "/stats?userId=" . $uid;

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 5);

$response = curl_exec($ch);
$err = curl_error($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($response === false) {
  http_response_code(502);
  echo json_encode(["ok" => false, "error" => "Stats service unreachable", "details" => $err]);
  exit;
}

http_response_code($code ?: 200);
header("Content-Type: application/json; charset=utf-8");
echo $response;
