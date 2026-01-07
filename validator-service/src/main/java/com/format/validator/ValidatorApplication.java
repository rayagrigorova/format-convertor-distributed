package com.format.validator;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.yaml.snakeyaml.Yaml;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.util.*;

@SpringBootApplication
public class ValidatorApplication {

  public static void main(String[] args) {
    SpringApplication.run(ValidatorApplication.class, args);
  }

  @RestController
  @CrossOrigin(origins = "*") // OK за localhost dev
  public static class ValidateController {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Yaml YAML = new Yaml();

    @GetMapping("/health")
    public Map<String, Object> health() {
      return Map.of("ok", true, "service", "validator-java");
    }

    /**
     * POST /validate
     * body: { "format": "xml|json|yaml|csv|emmet", "text": "..." }
     * returns:
     *   { "ok": true }
     *   or
     *   { "ok": false, "errors": ["...", "..."] }
     */
    @PostMapping("/validate")
    public ResponseEntity<Map<String, Object>> validate(@RequestBody Map<String, Object> req) {
      String format = String.valueOf(req.getOrDefault("format", "")).trim().toLowerCase();
      String text = String.valueOf(req.getOrDefault("text", ""));

      List<String> errors = switch (format) {
        case "json" -> validateJson(text);
        case "xml" -> validateXml(text);
        case "yaml" -> validateYaml(text);
        case "csv" -> validateCsv(text);
        case "emmet" -> validateEmmet(text);
        default -> List.of("Неподдържан формат за валидация: " + format);
      };

      if (errors.isEmpty()) {
        return ResponseEntity.ok(Map.of("ok", true));
      }
      return ResponseEntity.ok(Map.of("ok", false, "errors", errors));
    }

    // ---------------- validators ----------------

    private List<String> validateJson(String text) {
      String t = safeTrim(text);
      if (t.isEmpty()) return List.of("JSON: празен вход.");
      try {
        MAPPER.readTree(t);
        return List.of();
      } catch (Exception e) {
        return List.of("JSON: невалиден JSON – " + cleanMsg(e.getMessage()));
      }
    }

    private List<String> validateYaml(String text) {
      String t = safeTrim(text);
      if (t.isEmpty()) return List.of("YAML: празен вход.");
      try {
        YAML.load(t);
        return List.of();
      } catch (Exception e) {
        return List.of("YAML: невалиден YAML – " + cleanMsg(e.getMessage()));
      }
    }

    private List<String> validateXml(String text) {
      String t = safeTrim(text);
      if (t.isEmpty()) return List.of("XML: празен вход.");
      try {
        DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
        dbf.setNamespaceAware(true);

        // basic hardening
        dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        dbf.setFeature("http://xml.org/sax/features/external-general-entities", false);
        dbf.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        dbf.setXIncludeAware(false);
        dbf.setExpandEntityReferences(false);

        var db = dbf.newDocumentBuilder();
        db.parse(new InputSource(new StringReader(t)));
        return List.of();
      } catch (Exception e) {
        return List.of("XML: невалиден (не well-formed) – " + cleanMsg(e.getMessage()));
      }
    }

    private List<String> validateCsv(String text) {
      String t = safeTrim(text);
      if (t.isEmpty()) return List.of("CSV: празен вход.");

      String[] lines = t.split("\\r?\\n");
      if (lines.length < 2) return List.of("CSV: трябва да има поне header ред + 1 data ред.");

      int headerCols = splitCsvLine(lines[0]).size();
      if (headerCols < 1) return List.of("CSV: празен header.");

      List<String> errors = new ArrayList<>();
      for (int i = 1; i < lines.length; i++) {
        if (lines[i].isBlank()) continue;
        int cols = splitCsvLine(lines[i]).size();
        if (cols != headerCols) {
          errors.add("CSV: ред " + (i + 1) + " има " + cols + " колони, очаквани " + headerCols + ".");
        }
      }
      return errors;
    }

    // Минимална Emmet проверка (лека, но достатъчна)
    private List<String> validateEmmet(String text) {
      String t = safeTrim(text);
      if (t.isEmpty()) return List.of("Emmet: празен вход.");

      List<String> errors = new ArrayList<>();

      if (!t.matches("[A-Za-z0-9_\\-\\.\\#\\>\\+\\*\\(\\)\\{\\}\\[\\]\\s]+")) {
        errors.add("Emmet: има непозволени символи.");
      }

      checkBalanced(errors, t, '(', ')', "()");
      checkBalanced(errors, t, '{', '}', "{}");
      checkBalanced(errors, t, '[', ']', "[]");

      for (int i = 0; i < t.length(); i++) {
        if (t.charAt(i) == '*') {
          int j = i + 1;
          while (j < t.length() && Character.isWhitespace(t.charAt(j))) j++;
          if (j >= t.length() || !Character.isDigit(t.charAt(j))) {
            errors.add("Emmet: '*' трябва да е последвано от число (напр. li*3).");
            break;
          }
        }
      }

      return errors;
    }

    // ---------------- helpers ----------------

    private String safeTrim(String s) {
      return s == null ? "" : s.trim();
    }

    private String cleanMsg(String s) {
      if (s == null) return "неизвестна грешка";
      return s.replace("\n", " ").replace("\r", " ").trim();
    }

    private void checkBalanced(List<String> errors, String t, char open, char close, String label) {
      int bal = 0;
      for (int i = 0; i < t.length(); i++) {
        char c = t.charAt(i);
        if (c == open) bal++;
        if (c == close) bal--;
        if (bal < 0) {
          errors.add("Emmet: небалансирани " + label + " (затваряща скоба без отваряща).");
          return;
        }
      }
      if (bal != 0) {
        errors.add("Emmet: небалансирани " + label + " (липсва затваряща скоба).");
      }
    }

    // минимален CSV split, пази кавички
    private List<String> splitCsvLine(String line) {
      List<String> out = new ArrayList<>();
      StringBuilder cur = new StringBuilder();
      boolean inQuotes = false;

      for (int i = 0; i < line.length(); i++) {
        char c = line.charAt(i);

        if (c == '"') {
          if (inQuotes && i + 1 < line.length() && line.charAt(i + 1) == '"') {
            cur.append('"');
            i++;
          } else {
            inQuotes = !inQuotes;
          }
          continue;
        }

        if (c == ',' && !inQuotes) {
          out.add(cur.toString());
          cur.setLength(0);
          continue;
        }

        cur.append(c);
      }
      out.add(cur.toString());
      return out;
    }
  }
}
