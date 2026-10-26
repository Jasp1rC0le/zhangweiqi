// Diagnostic only: use the selected release's Spring mail auto-configuration.
// Performs TLS/authentication and closes transport; never submits a message or opens a database.
import java.util.Properties;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.mail.autoconfigure.MailSenderAutoConfiguration;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.io.FileSystemResource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

public class SmtpJavaProbe {
    public static void main(String[] args) {
        try (var context = new AnnotationConfigApplicationContext()) {
            if (args.length != 1) throw new IllegalArgumentException("packaged configuration required");
            for (var source : new YamlPropertySourceLoader().load("packaged-application", new FileSystemResource(args[0]))) {
                context.getEnvironment().getPropertySources().addLast(source);
            }
            context.register(MailSenderAutoConfiguration.class);
            context.refresh();
            var bean = context.getBean(JavaMailSender.class);
            if (!(bean instanceof JavaMailSenderImpl sender)) throw new IllegalStateException("unexpected mail sender");
            if (!"smtp.exmail.qq.com".equals(sender.getHost()) || sender.getPort() != 465
                    || !"contact@campthinkhub.cn".equals(sender.getUsername())) {
                throw new IllegalStateException("SMTP destination differs from the approved mailbox");
            }
            Properties properties = sender.getJavaMailProperties();
            for (String key : new String[]{"mail.smtp.auth", "mail.smtp.ssl.enable", "mail.smtp.ssl.checkserveridentity"}) {
                if (!Boolean.parseBoolean(properties.getProperty(key))) throw new IllegalStateException("SMTP security property missing");
            }
            if (!properties.getProperty("mail.smtp.ssl.trust", "").isBlank()) {
                throw new IllegalStateException("custom certificate trust is not allowed");
            }
            for (String key : new String[]{"mail.smtp.connectiontimeout", "mail.smtp.timeout", "mail.smtp.writetimeout"}) {
                int timeout = Integer.parseInt(properties.getProperty(key, "0"));
                if (timeout < 1 || timeout > 8000) throw new IllegalStateException("SMTP timeout must be bounded");
            }
            sender.testConnection();
            System.out.println("{\"status\":\"authenticated\",\"springAutoConfiguration\":true,\"ssl\":true,\"hostnameVerification\":true,\"sent\":false,\"databaseOpened\":false}");
        } catch (Exception failure) {
            // No exception message, server reply, credentials or stack trace in the public receipt.
            System.out.println("{\"status\":\"failed\",\"failureType\":\"" + failure.getClass().getSimpleName() + "\",\"sent\":false}");
            System.exit(1);
        }
    }
}
