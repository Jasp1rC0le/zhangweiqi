package com.campusai.security;

import com.campusai.exception.UnauthorizedException;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class JwtInterceptor implements HandlerInterceptor {
    private static final String VERIFIED=JwtInterceptor.class.getName()+".verified";
    private record Verified(String method,String path,Long user,String role,String session,String username) {}

    private final JwtService jwtService;
    private final AuthSessionService sessions;

    public JwtInterceptor(JwtService jwtService, AuthSessionService sessions) {
        this.jwtService = jwtService;
        this.sessions = sessions;
    }

    @Override
    public boolean preHandle(
            HttpServletRequest request,
            HttpServletResponse response,
            Object handler) {

        // 以后前端发送跨域预检请求时直接放行
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        // 已发布商家的照片不含账户数据；允许浏览器图片元素直接加载。
        if ("GET".equalsIgnoreCase(request.getMethod())
                && request.getRequestURI() != null
                && request.getRequestURI().matches("/api/canteens/merchants/[0-9]+/(?:photo|photos/[0-9]+)")) {
            return true;
        }

        // 用户注册接口公开，不需要登录
        if ("POST".equalsIgnoreCase(request.getMethod())
                && "/api/users".equals(request.getRequestURI())) {
            return true;
        }

        // An async dispatch completes the same request, not a fresh bearer login.
        // Trust only our server-created, exact-request proof; still enforce revocation.
        if(request.getDispatcherType()==jakarta.servlet.DispatcherType.ASYNC) {
            if(!(request.getAttribute(VERIFIED) instanceof Verified verified)
                    || !verified.method().equals(request.getMethod()) || !verified.path().equals(request.getRequestURI()))
                throw new UnauthorizedException("异步请求缺少已核验身份");
            boolean active;
            try {active=sessions.active(verified.session(),verified.user(),verified.role());}
            catch(RuntimeException failure) {if(response.isCommitted()) return false;throw failure;}
            if(!active) {
                if(response.isCommitted()) return false; // Never append JSON to a finished SSE body.
                throw new UnauthorizedException("登录会话已失效，请重新登录");
            }
            request.setAttribute("currentUserId",verified.user());request.setAttribute("currentUserRole",verified.role());
            request.setAttribute("currentSessionId",verified.session());request.setAttribute("currentUsername",verified.username());
            return true;
        }

        // 站外访客也可以直接提交联系与反馈，不强制登录
        if ("POST".equalsIgnoreCase(request.getMethod())
                && "/api/contact-messages".equals(request.getRequestURI())
                && request.getHeader("Authorization") == null) {
            return true;
        }

        String authorization = request.getHeader("Authorization");

        if (authorization == null
                || !authorization.startsWith("Bearer ")) {
            throw new UnauthorizedException("缺少有效的登录令牌");
        }

        String token = authorization.substring(7).trim();

        if (token.isEmpty()) {
            throw new UnauthorizedException("登录令牌不能为空");
        }

        try {
            Claims claims = jwtService.parseToken(token);

            Long currentUserId = Long.valueOf(claims.getSubject());
            String currentUserRole = claims.get("role", String.class);
            if (!sessions.active(claims.get("sid", String.class), currentUserId, currentUserRole)) {
                throw new UnauthorizedException("登录会话已失效，请重新登录");
            }
            // 不依赖隐藏入口或某个控制器恰好记得检查权限。
            if (request.getRequestURI() != null && request.getRequestURI().startsWith("/api/admin/")
                    && !"ADMIN".equals(currentUserRole)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "需要管理员权限");
            }
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("X-Content-Type-Options", "nosniff");
            String currentUsername =
                    claims.get("username", String.class);

            request.setAttribute("currentUserId", currentUserId);
            request.setAttribute("currentUsername", currentUsername);
            request.setAttribute("currentUserRole", currentUserRole);
            request.setAttribute("currentSessionId", claims.get("sid", String.class));
            request.setAttribute(VERIFIED,new Verified(request.getMethod(),request.getRequestURI(),currentUserId,currentUserRole,
                    claims.get("sid",String.class),currentUsername));

            return true;
        } catch (ExpiredJwtException exception) {
            throw new UnauthorizedException("登录令牌已过期，请重新登录");
        } catch (JwtException | IllegalArgumentException exception) {
            throw new UnauthorizedException("登录令牌无效");
        }
    }
}
