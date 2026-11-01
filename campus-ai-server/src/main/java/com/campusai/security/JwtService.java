package com.campusai.security;

import com.campusai.user.entity.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.util.Date;

@Component
public class JwtService {

    private final SecretKey key;
    private final long expirationMillis;

    public JwtService(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.expiration-millis}") long expirationMillis) {

        this.key = Keys.hmacShaKeyFor(
                Decoders.BASE64.decode(secret)
        );
        this.expirationMillis = expirationMillis;
    }

    public String generateToken(User user, String sessionId) {
        Instant now = Instant.now();

        return Jwts.builder()
                .subject(user.getId().toString())
                .claim("username", user.getUsername())
                .claim("role", user.getRole())
                .claim("sid", sessionId)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusMillis(expirationMillis)))
                .signWith(key)
                .compact();
    }

    public Claims parseToken(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public long getExpirationSeconds() {
        return expirationMillis / 1000;
    }

    /** A separate, domain-derived proof for read-only calendar links; never a login JWT. */
    public String calendarLinkProof(String id) {
        if (id == null || !id.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("Invalid calendar identifier");
        try {
            var derive = javax.crypto.Mac.getInstance("HmacSHA256");
            derive.init(new javax.crypto.spec.SecretKeySpec(key.getEncoded(), "HmacSHA256"));
            byte[] calendarKey = derive.doFinal("Campthink/calendar-link/key/v1".getBytes(java.nio.charset.StandardCharsets.UTF_8));
            var proof = javax.crypto.Mac.getInstance("HmacSHA256");
            proof.init(new javax.crypto.spec.SecretKeySpec(calendarKey, "HmacSHA256"));
            return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(proof.doFinal(id.getBytes(java.nio.charset.StandardCharsets.US_ASCII)));
        } catch (java.security.GeneralSecurityException failure) { throw new IllegalStateException("Calendar signing unavailable", failure); }
    }
}
