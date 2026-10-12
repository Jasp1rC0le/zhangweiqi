package com.campusai.career;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

class CareerServiceTest {
    @Test
    void editingPublishedEmployerReturnsItToDraft() {
        CareerMapper mapper = mock(CareerMapper.class);
        CampusEmployer original = new CampusEmployer();
        original.setId(8L);
        original.setStatus("PUBLISHED");
        when(mapper.employer(1L, 8L)).thenReturn(original);
        CareerService service = new CareerService(mapper);

        service.saveEmployer(1L, 8L,
                new CareerService.EmployerInput("企业A", "制造业", "", "介绍"));

        verify(mapper).employerStatus(1L, 8L, "DRAFT");
    }

    @Test
    void shouldNotAttachJobToEmployerFromAnotherSchool() {
        CareerMapper mapper = mock(CareerMapper.class);
        CareerService service = new CareerService(mapper);
        var input = new CareerService.JobInput(8L, "开发实习", "实习", "天津", null,
                "招聘内容", null, null);
        assertThatThrownBy(() -> service.saveJob(1L, null, input))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("本校企业不存在");
    }

    @Test
    void shouldRejectExpiredJobPublication() {
        CareerMapper mapper = mock(CareerMapper.class);
        CampusJob job = new CampusJob();
        job.setId(3L);
        job.setEmployerId(8L);
        job.setExpiresAt(LocalDateTime.now().minusDays(1));
        when(mapper.job(1L, 3L)).thenReturn(job);
        CampusEmployer employer = new CampusEmployer();
        employer.setId(8L);
        employer.setStatus("PUBLISHED");
        when(mapper.employer(1L, 8L)).thenReturn(employer);
        CareerService service = new CareerService(mapper);
        assertThatThrownBy(() -> service.publishJob(1L, 3L, true))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("已过期");
    }
}
