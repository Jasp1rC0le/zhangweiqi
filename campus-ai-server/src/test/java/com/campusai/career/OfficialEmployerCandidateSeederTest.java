package com.campusai.career;

import com.campusai.mapper.SchoolMapper;
import com.campusai.school.entity.School;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OfficialEmployerCandidateSeederTest {
    @Test
    void seedsReviewQueueButDoesNotPublishEmployers() {
        SchoolMapper schools = mock(SchoolMapper.class);
        EmployerDiscoveryService discovery = mock(EmployerDiscoveryService.class);
        School school = new School();
        school.setId(1L);
        school.setName("天津中德应用技术大学");
        when(schools.findAllActive()).thenReturn(List.of(school));

        new OfficialEmployerCandidateSeeder(schools, discovery, true).seed();

        verify(discovery, times(8)).seedOfficialCandidate(
                org.mockito.ArgumentMatchers.eq(1L), org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString());
    }
}
