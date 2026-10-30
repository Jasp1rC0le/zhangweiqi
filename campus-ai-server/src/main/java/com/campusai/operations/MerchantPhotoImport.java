package com.campusai.operations;

import com.campusai.canteen.CanteenPhotoService;
import com.campusai.canteen.CanteenService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.*;

/** Explicit SSH operator command. No HTTP endpoint, login token, role grant or automatic runner. */
public final class MerchantPhotoImport {
    @Configuration(proxyBeanMethods = false)
    @Profile("merchant-import-cli")
    @EnableAutoConfiguration
    @EnableTransactionManagement
    public static class ImportConfiguration {
        @Bean CanteenService canteens(JdbcTemplate jdbc) { return new CanteenService(jdbc); }
        @Bean CanteenPhotoService photos(JdbcTemplate jdbc, CanteenService canteens) { return new CanteenPhotoService(jdbc, canteens); }
    }

    public record Entry(String name, String location, String description, Long existingId,
                        String expectedName, List<MultipartFile> photos) {}
    public record Plan(String school, String canteen, List<Entry> entries) {}

    public static void main(String[] args) throws Exception {
        if (args.length != 4 || !List.of("--check", "--apply").contains(args[0]))
            throw new IllegalArgumentException("Use --check|--apply manifest.json expected-sha256 receipt.json");
        Path source = Path.of(args[1]).toRealPath();
        if (!sha(Files.readAllBytes(source)).equals(args[2])) throw new IllegalArgumentException("Manifest fingerprint changed");
        Path receipt = Path.of(args[3]).toAbsolutePath();
        if (Files.exists(receipt)) throw new IllegalArgumentException("Receipt already exists; inspect it instead of repeating import");
        var mapper = new ObjectMapper();
        Plan plan = readPlan(source, mapper);
        try (var context = new SpringApplicationBuilder(ImportConfiguration.class)
                .profiles("prod", "merchant-import-cli").web(WebApplicationType.NONE)
                .run("--spring.sql.init.mode=never", "--spring.main.banner-mode=off",
                        "--spring.datasource.hikari.maximum-pool-size=2")) {
            var jdbc = context.getBean(JdbcTemplate.class);
            var tx = new TransactionTemplate(context.getBean(PlatformTransactionManager.class));
            var result = tx.execute(status -> execute(plan, jdbc, context.getBean(CanteenService.class),
                    context.getBean(CanteenPhotoService.class), "--apply".equals(args[0])));
            Map<String,Object> output = new LinkedHashMap<>();
            output.put("at", OffsetDateTime.now().toString()); output.put("manifestSha256",args[2]);
            output.put("mode",args[0]);output.put("authorization","explicit owner request over authenticated deployment SSH");
            output.put("school",plan.school());output.put("merchants",result);
            Files.writeString(receipt, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(output)+"\n", StandardOpenOption.CREATE_NEW);
            System.out.println("Merchant receipt saved: " + receipt + "; entries=" + plan.entries().size());
        }
    }

    static Plan readPlan(Path manifest, ObjectMapper mapper) throws Exception {
        if (Files.size(manifest)>100_000) throw new IllegalArgumentException("Manifest too large");
        JsonNode root = mapper.readTree(Files.readAllBytes(manifest));
        if (root.path("version").asInt()!=1 || !root.path("merchants").isArray()
                || root.path("merchants").isEmpty() || root.path("merchants").size()>50)
            throw new IllegalArgumentException("Invalid merchant manifest");
        Path photoRoot = manifest.getParent().resolve("photos").toRealPath();
        List<Entry> entries = new ArrayList<>(); Set<String> names = new HashSet<>();
        long bytes = 0; int photoCount = 0;
        for (var row : root.path("merchants")) {
            String name = text(row,"name",120), location=text(row,"location",120);
            if (!names.add(name.toLowerCase(Locale.ROOT))) throw new IllegalArgumentException("Duplicate merchant name");
            Long existing = row.path("existingId").isIntegralNumber() ? row.path("existingId").longValue() : null;
            String expected = existing == null ? null : text(row,"expectedName",120);
            if (existing != null && existing<1) throw new IllegalArgumentException("Invalid existing merchant");
            String description=row.path("description").asText("");
            if (description.length()>1000) throw new IllegalArgumentException("Description too long");
            var files = row.path("files");
            if (!files.isArray() || files.isEmpty() || files.size()>10) throw new IllegalArgumentException("Invalid photo count");
            List<MultipartFile> photos = new ArrayList<>();
            for (var file : files) {
                Path path = manifest.getParent().resolve(file.path("path").asText()).normalize();
                if (Files.isSymbolicLink(path) || !Files.isRegularFile(path) || !path.toRealPath().startsWith(photoRoot))
                    throw new IllegalArgumentException("Photo outside approved import directory");
                if (Files.size(path)>5L*1024*1024) throw new IllegalArgumentException("Photo too large");
                byte[] data=Files.readAllBytes(path); bytes+=data.length;photoCount++;
                if (!sha(data).equals(file.path("sha256").asText())) throw new IllegalArgumentException("Photo fingerprint changed");
                photos.add(new PhotoFile(path.getFileName().toString(),data));
            }
            entries.add(new Entry(name,location,description,existing,expected,List.copyOf(photos)));
        }
        if (bytes>120L*1024*1024 || photoCount>100) throw new IllegalArgumentException("Import budget exceeded");
        return new Plan(text(root,"schoolName",120),text(root,"canteenName",120),List.copyOf(entries));
    }

    static List<Map<String,Object>> execute(Plan plan, JdbcTemplate jdbc, CanteenService canteens,
                                           CanteenPhotoService photos, boolean apply) {
        var schools=jdbc.queryForList("SELECT id FROM schools WHERE name=? AND status=1",Long.class,plan.school());
        if(schools.size()!=1)throw new IllegalArgumentException("Expected one active school");
        Long school=schools.get(0);
        var places=canteens.adminCanteens(school).stream().filter(c->c.name().equals(plan.canteen())&&c.status().equals("PUBLISHED")).toList();
        if(places.size()!=1)throw new IllegalArgumentException("Expected one published canteen");
        Long place=places.get(0).id();
        if(apply)jdbc.queryForList("SELECT id FROM campus_canteen_merchants WHERE school_id=? AND canteen_id=? ORDER BY id FOR UPDATE",Long.class,school,place);
        var catalog=canteens.adminMerchants(school);
        // Reconcile the entire plan before any metadata or photo write.
        for(var entry:plan.entries()) {
            if(entry.existingId()!=null) {
                var old=catalog.stream().filter(m->m.id().equals(entry.existingId())).findFirst().orElseThrow();
                if(!old.canteenId().equals(place)||!old.name().equals(entry.expectedName())||!old.status().equals("PUBLISHED"))
                    throw new IllegalArgumentException("Existing merchant no longer matches reviewed plan");
            } else if(catalog.stream().anyMatch(m->m.canteenId().equals(place)&&m.name().equalsIgnoreCase(entry.name())))
                throw new IllegalArgumentException("Merchant already exists; reconcile plan before applying");
        }
        List<Map<String,Object>> result=new ArrayList<>();
        for(var entry:plan.entries()) {
            if(!apply){result.add(Map.of("name",entry.name(),"photos",entry.photos().size(),"existing",entry.existingId()!=null));continue;}
            Long id;
            if(entry.existingId()!=null) {
                id=entry.existingId();canteens.saveMerchant(school,id,new CanteenService.MerchantInput(place,entry.name(),entry.location(),entry.description()));
                photos.save(school,id,entry.photos().get(0));canteens.setMerchantPublished(school,id,true);
            } else {
                var merchant=photos.publish(school,List.of(new CanteenPhotoService.PublishInput(place,entry.name(),entry.location())),List.of(entry.photos().get(0))).get(0);
                id=merchant.id();
            }
            if(entry.photos().size()>1)photos.append(school,id,entry.photos().subList(1,entry.photos().size()));
            result.add(Map.of("id",id,"name",entry.name(),"location",entry.location(),"photos",photos.photoList(school,id,true).size(),"status","PUBLISHED"));
        }
        return List.copyOf(result);
    }

    private static String text(JsonNode row,String field,int limit) {
        var value=row.path(field).asText("").strip();
        if(value.isEmpty()||value.length()>limit||value.indexOf('\0')>=0)throw new IllegalArgumentException("Invalid "+field);
        return value;
    }
    private static String sha(byte[] data)throws Exception{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));}
    private record PhotoFile(String filename, byte[] data) implements MultipartFile {
        public String getName(){return "files";} public String getOriginalFilename(){return filename;}
        public String getContentType(){return "image/jpeg";} public boolean isEmpty(){return data.length==0;}
        public long getSize(){return data.length;} public byte[] getBytes(){return data.clone();}
        public InputStream getInputStream(){return new ByteArrayInputStream(data);}
        public void transferTo(File dest)throws IOException{Files.write(dest.toPath(),data);}
    }
}
