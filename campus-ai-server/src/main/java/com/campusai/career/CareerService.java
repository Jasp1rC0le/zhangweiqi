package com.campusai.career;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class CareerService {
    private final CareerMapper mapper;

    public CareerService(CareerMapper mapper) { this.mapper = mapper; }

    public record EmployerInput(@NotBlank @Size(max = 200) String name,
            @Size(max = 100) String industry,
            @Size(max = 1000) @Pattern(regexp = "^$|https?://[^\\s]+$") String websiteUrl,
            @Size(max = 5000) String description) {}

    public record JobInput(@NotNull @Positive Long employerId,
            @NotBlank @Size(max = 200) String title,
            @Size(max = 50) String employmentType, @Size(max = 200) String location,
            @Size(max = 1000) @Pattern(regexp = "^$|https?://[^\\s]+$") String sourceUrl,
            @NotBlank @Size(max = 10000) String description,
            LocalDateTime postedAt, LocalDateTime expiresAt) {}

    public List<CampusEmployer> employers(Long schoolId) { return mapper.employers(schoolId); }
    public List<CampusJob> jobs(Long schoolId) { return mapper.jobs(schoolId); }
    public List<CampusJob> publishedJobs(Long schoolId) { return mapper.publishedJobs(schoolId); }

    @Transactional
    public CampusEmployer saveEmployer(Long schoolId, Long id, EmployerInput input) {
        CampusEmployer value = id == null ? new CampusEmployer() : requireEmployer(schoolId, id);
        value.setSchoolId(schoolId);
        value.setName(input.name().trim());
        value.setIndustry(trim(input.industry()));
        value.setWebsiteUrl(trim(input.websiteUrl()));
        value.setDescription(trim(input.description()));
        if (id == null) mapper.insertEmployer(value);
        else {
            mapper.updateEmployer(value);
            if ("PUBLISHED".equals(value.getStatus())) mapper.employerStatus(schoolId, id, "DRAFT");
        }
        return mapper.employer(schoolId, value.getId());
    }

    @Transactional
    public CampusJob saveJob(Long schoolId, Long id, JobInput input) {
        requireEmployer(schoolId, input.employerId());
        if (input.expiresAt() != null && input.postedAt() != null
                && !input.expiresAt().isAfter(input.postedAt())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "岗位截止时间须晚于发布时间");
        }
        CampusJob value = id == null ? new CampusJob() : requireJob(schoolId, id);
        value.setSchoolId(schoolId);
        value.setEmployerId(input.employerId());
        value.setTitle(input.title().trim());
        value.setEmploymentType(trim(input.employmentType()));
        value.setLocation(trim(input.location()));
        value.setSourceUrl(trim(input.sourceUrl()));
        value.setDescription(input.description().trim());
        value.setPostedAt(input.postedAt());
        value.setExpiresAt(input.expiresAt());
        if (id == null) mapper.insertJob(value);
        else {
            mapper.updateJob(value);
            if ("PUBLISHED".equals(value.getStatus())) mapper.jobStatus(schoolId, id, "DRAFT");
        }
        return mapper.job(schoolId, value.getId());
    }

    @Transactional
    public CampusEmployer publishEmployer(Long schoolId, Long id, boolean published) {
        requireEmployer(schoolId, id);
        mapper.employerStatus(schoolId, id, published ? "PUBLISHED" : "ARCHIVED");
        return mapper.employer(schoolId, id);
    }

    @Transactional
    public CampusJob publishJob(Long schoolId, Long id, boolean published) {
        CampusJob job = requireJob(schoolId, id);
        if (published) {
            CampusEmployer employer = requireEmployer(schoolId, job.getEmployerId());
            if (!"PUBLISHED".equals(employer.getStatus())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "请先发布所属企业");
            }
            if (job.getExpiresAt() != null && !job.getExpiresAt().isAfter(LocalDateTime.now())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "已过期岗位不能发布");
            }
        }
        mapper.jobStatus(schoolId, id, published ? "PUBLISHED" : "ARCHIVED");
        return mapper.job(schoolId, id);
    }

    private CampusEmployer requireEmployer(Long schoolId, Long id) {
        CampusEmployer value = mapper.employer(schoolId, id);
        if (value == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "本校企业不存在");
        return value;
    }

    private CampusJob requireJob(Long schoolId, Long id) {
        CampusJob value = mapper.job(schoolId, id);
        if (value == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "本校岗位不存在");
        return value;
    }

    private String trim(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}
